import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { spaceSummaryResponseSchema } from '@nimbo/contracts';
import { QueueEvents } from 'bullmq';
import type { JobsOptions, Queue } from 'bullmq';

import { StorageWorkerModule } from '../../../src/modules/storage';
import { I_SPACE_REPOSITORY } from '../../../src/modules/storage/application/ports/i-space.repository.port';
import type { ISpaceRepository } from '../../../src/modules/storage/application/ports/i-space.repository.port';
import {
  USAGE_RECONCILE_JOB_NAME,
  USAGE_RECONCILE_QUEUE,
} from '../../../src/modules/storage/infrastructure/usage-reconcile.scheduler';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import type { Actor } from '../../../src/shared';
import { buildBullConnection } from '../../../src/shared/infrastructure/queue/bull.config';
import { requiredEnv } from '../../support/database-urls';
import type { LogLine } from '../setup/log-sink';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { createStorageHttpApp, STORAGE_HTTP_BUCKET, textBytes, usedBytesOf } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

/** Un día: el programa repetible no corre por su cuenta durante la suite; cada pasada la encola la prueba. */
const RECONCILE_INTERVAL_MINUTES = '1440';
/** Páginas chicas: la pasada recorre varias páginas de cuentas aunque la base tenga pocas. */
const RECONCILE_BATCH_SIZE = '2';
const JOB_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 200;
/** Una sola pasada, sin reintentos de BullMQ: la prueba ve el fallo tal como queda. */
const SINGLE_ATTEMPT: JobsOptions = { attempts: 1 };
const DRIFT_BYTES = 5000n;
const PENDING_UPLOAD_BYTES = 700;

/**
 * Conciliación de `espacio_usado` de punta a punta (spec 007 CA-13 a CA-15): los archivos se suben por la API
 * (`StorageModule`, MinIO real), la deriva se provoca como el dueño de las tablas y el `worker` (`StorageWorkerModule`,
 * `nimbo_app`) consume `usage-reconcile` contra Postgres y Redis reales.
 */
describe('conciliación de espacio de punta a punta (007 CA-13 a CA-15)', () => {
  let storage: StorageHttpApp;
  let worker: TestApp;
  let queueEvents: QueueEvents;
  let queue: Queue;
  const failingAccounts = new Set<string>();

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    // El `PinoLogger` de `nestjs-pino` es estático: la última app creada (el `worker`) recibe las bitácoras de ambas.
    const workerEnv = buildTestEnv(
      {
        MINIO_BUCKET: STORAGE_HTTP_BUCKET,
        USAGE_RECONCILE_INTERVAL_MINUTES: RECONCILE_INTERVAL_MINUTES,
        USAGE_RECONCILE_BATCH_SIZE: RECONCILE_BATCH_SIZE,
      },
      { withWorkerEnv: true },
    );
    worker = await createTestApp({
      validatedEnv: workerEnv,
      modules: [PlanLimitsBindingModule, StorageWorkerModule.forRoot(workerEnv)],
      prefix: '',
    });
    failOnMeasureFor(worker.app.get<ISpaceRepository>(I_SPACE_REPOSITORY));
    queue = worker.app.get<Queue>(getQueueToken(USAGE_RECONCILE_QUEUE));
    queueEvents = new QueueEvents(USAGE_RECONCILE_QUEUE, {
      connection: buildBullConnection(requiredEnv('REDIS_URL')),
    });
    await queueEvents.waitUntilReady();
    await waitFor(
      async () => (await queue.getActiveCount()) + (await queue.getWaitingCount()) === 0,
    );
  });

  afterAll(async () => {
    await queueEvents?.close();
    await worker?.close();
    await storage?.close();
  });

  /** La medición real, salvo para las cuentas de `failingAccounts`: como una base que falla con esa cuenta (CA-15). */
  const failOnMeasureFor = (spaces: ISpaceRepository): void => {
    const measure = spaces.liveBytesByKind.bind(spaces);
    jest.spyOn(spaces, 'liveBytesByKind').mockImplementation((actor: Actor) => {
      if (failingAccounts.has(actor.id)) return Promise.reject(new Error('Postgres no respondió'));
      return measure(actor);
    });
  };

  /** Una pasada del trabajo `usage-reconcile`, como el programa repetible; espera a que termine (o falle). */
  const runReconcile = async (): Promise<void> => {
    const job = await queue.add(
      USAGE_RECONCILE_JOB_NAME,
      { correlationId: randomUUID() },
      SINGLE_ATTEMPT,
    );
    await job.waitUntilFinished(queueEvents, JOB_TIMEOUT_MS);
  };

  const waitFor = async (condition: () => Promise<boolean>): Promise<void> => {
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error('La condición no se cumplió a tiempo');
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  };

  const uploaded = async (
    client: StorageClient,
    name: string,
    size: number,
    folderId: string | null = null,
  ): Promise<void> => {
    const response = await client.upload(name, textBytes(size), 'ask', folderId);
    expect(response.status).toBe(200);
  };

  /** Sube a una carpeta nueva y la manda a la papelera: el archivo cuenta como papelera hasta la purga. */
  const trashedUpload = async (
    client: StorageClient,
    name: string,
    size: number,
  ): Promise<void> => {
    const folder = await client.createFolder({ name: `Viejos ${randomUUID()}`, parentId: null });
    expect(folder.status).toBe(201);
    const folderId = (folder.body as { id: string }).id;
    await uploaded(client, name, size, folderId);
    expect((await client.trashFolder(folderId)).status).toBe(200);
  };

  /** Desvía el contador a mano, como lo haría un fallo entre MinIO y la base. */
  const setUsedBytes = async (userId: string, bytes: bigint): Promise<void> => {
    await storage.owner.query('UPDATE usuario SET espacio_usado = $1 WHERE id = $2', [
      bytes.toString(),
      userId,
    ]);
  };

  const reconcileLines = (userId: string): LogLine[] =>
    worker.logs
      .lines()
      .filter((line) => String(line.event).startsWith('quota.') && line.userId === userId);

  it('CA-13: corrige la deriva en los dos sentidos (vivos y papelera) y deja un evento con UUID y diferencia, sin nombres', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    await uploaded(ana, 'presupuesto-anual.txt', 3000);
    await trashedUpload(ana, 'borrador-viejo.txt', 1000);
    await uploaded(bruno, 'contrato-firmado.txt', 2000);
    await setUsedBytes(ana.id, 4000n + DRIFT_BYTES);
    await setUsedBytes(bruno.id, 0n);

    await runReconcile();

    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(4000n);
    await expect(usedBytesOf(storage.owner, bruno.id)).resolves.toBe(2000n);
    expect(reconcileLines(ana.id)).toEqual([
      expect.objectContaining({ event: 'quota.reconciled', diffBytes: -Number(DRIFT_BYTES) }),
    ]);
    expect(reconcileLines(bruno.id)).toEqual([
      expect.objectContaining({ event: 'quota.reconciled', diffBytes: 2000 }),
    ]);
    const logged = JSON.stringify(worker.logs.lines());
    for (const name of ['presupuesto-anual', 'borrador-viejo', 'contrato-firmado']) {
      expect(logged).not.toContain(name);
    }
  });

  it('CA-14: una cuenta coherente no cambia; su carga en curso conserva la reserva y no se cuenta dos veces', async () => {
    const carla = await storage.newClient();
    await uploaded(carla, 'notas.txt', 1500);
    const pending = await carla.init({ name: 'pendiente.txt', sizeBytes: PENDING_UPLOAD_BYTES });
    expect(pending.status).toBe(201);

    await runReconcile();

    await expect(usedBytesOf(storage.owner, carla.id)).resolves.toBe(1500n);
    expect(reconcileLines(carla.id)).toEqual([]);
    const summary = spaceSummaryResponseSchema.parse((await carla.spaceSummary()).body);
    expect(summary).toMatchObject({ usedBytes: 1500, reservedBytes: PENDING_UPLOAD_BYTES });
  });

  it('CA-15: si falla una cuenta, las demás se concilian, esa conserva su valor y el siguiente ciclo la corrige', async () => {
    const dana = await storage.newClient();
    const erik = await storage.newClient();
    await uploaded(dana, 'a.txt', 800);
    await uploaded(erik, 'b.txt', 900);
    await setUsedBytes(dana.id, DRIFT_BYTES);
    await setUsedBytes(erik.id, DRIFT_BYTES);
    failingAccounts.add(dana.id);

    await expect(runReconcile()).rejects.toThrow();

    await expect(usedBytesOf(storage.owner, dana.id)).resolves.toBe(DRIFT_BYTES);
    await expect(usedBytesOf(storage.owner, erik.id)).resolves.toBe(900n);
    expect(reconcileLines(dana.id)).toEqual([
      expect.objectContaining({ event: 'quota.reconcile_failed', errorName: 'Error' }),
    ]);

    failingAccounts.delete(dana.id);
    await runReconcile();

    await expect(usedBytesOf(storage.owner, dana.id)).resolves.toBe(800n);
  });
});
