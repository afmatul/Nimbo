import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { spaceSummaryResponseSchema } from '@nimbo/contracts';
import { QueueEvents } from 'bullmq';
import type { JobsOptions, Queue } from 'bullmq';

import { StorageWorkerModule } from '../../../src/modules/storage';
import { I_OBJECT_STORAGE } from '../../../src/modules/storage/application/ports/i-object-storage.port';
import type { IObjectStorage } from '../../../src/modules/storage/application/ports/i-object-storage.port';
import { I_SPACE_REPOSITORY } from '../../../src/modules/storage/application/ports/i-space.repository.port';
import type { ISpaceRepository } from '../../../src/modules/storage/application/ports/i-space.repository.port';
import {
  USAGE_RECONCILE_JOB_NAME,
  USAGE_RECONCILE_QUEUE,
} from '../../../src/modules/storage/infrastructure/usage-reconcile.scheduler';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { buildBullConnection } from '../../../src/shared/infrastructure/queue/bull.config';
import { requiredEnv } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import type { LogLine } from '../setup/log-sink';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { registerVersion } from './register-version';
import {
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  STORAGE_HTTP_BUCKET,
  textBytes,
  usedBytesOf,
} from './storage-http';
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
const ORIGINAL_BYTES = 3000;
const OPTIMIZED_BYTES = 1000;
const DAY_MS = 86_400_000;

/** Un archivo optimizado: la versión 1 quedó como original conservado y la 2 es la actual (014b). */
interface OptimizedFile {
  readonly fileId: string;
  readonly originalId: string;
  readonly originalKey: string;
}

/**
 * Conciliación de `espacio_usado` de punta a punta (spec 007 CA-13 a CA-15): los archivos se suben por la API
 * (`StorageModule`, MinIO real), la deriva se provoca como el dueño de las tablas y el `worker` (`StorageWorkerModule`,
 * `nimbo_app`) consume `usage-reconcile` contra Postgres y Redis reales. Desde 014b la pasada purga antes los originales
 * conservados vencidos (CA-6, CA-7, CA-9, CA-13): el reloj del `worker` se adelanta en vez de esperar el plazo.
 */
describe('conciliación de espacio de punta a punta (007 CA-13 a CA-15)', () => {
  let storage: StorageHttpApp;
  let worker: TestApp;
  let queueEvents: QueueEvents;
  let queue: Queue;
  const failingAccounts = new Set<string>();
  const failingKeys = new Set<string>();
  /** El reloj del `worker` es también el de la estrategia de tokens de prueba: fuera de una pasada, la hora de los tokens. */
  const clock = new FixedClock(PROBE_CLOCK_START);

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
      overrides: [{ provide: I_CLOCK, useValue: clock }],
      prefix: '',
    });
    failOnMeasureFor(worker.app.get<ISpaceRepository>(I_SPACE_REPOSITORY));
    failOnPurgeFor(worker.app.get<IObjectStorage>(I_OBJECT_STORAGE));
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

  /** El borrado real, salvo para las claves de `failingKeys`: como un MinIO que falla con ese objeto (014b CA-7). */
  const failOnPurgeFor = (objects: IObjectStorage): void => {
    const purge = objects.purgeObject.bind(objects);
    jest.spyOn(objects, 'purgeObject').mockImplementation((key: string) => {
      if (failingKeys.has(key))
        return Promise.reject(new Error(`MinIO no respondió al borrar ${key}`));
      return purge(key);
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

  /** Sube `name` y lo optimiza con el doble del origen `optimizacion` (014b): conserva la versión 1 como original. */
  const optimizedFile = async (
    client: StorageClient,
    name: string,
    folderId: string | null = null,
  ): Promise<OptimizedFile> => {
    const response = await client.upload(name, textBytes(ORIGINAL_BYTES), 'ask', folderId);
    expect(response.status).toBe(200);
    const fileId = (response.body as { file: { id: string } }).file.id;
    const [original] = await versionRows(fileId);
    if (original === undefined) throw new Error('La carga no dejó su versión');
    await registerVersion(storage, client, {
      fileId,
      sizeBytes: OPTIMIZED_BYTES,
      keepPreviousForDays: DEFAULT_TEST_LIMITS.trashRetentionDays,
    });
    return { fileId, originalId: original.id, originalKey: original.clave_objeto };
  };

  const versionRows = (fileId: string): Promise<{ id: string; clave_objeto: string }[]> =>
    storage.owner.query(
      'SELECT id, clave_objeto FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [fileId],
    );

  /** Una pasada con el reloj del `worker` un día después del plazo de conservación del plan (014b RN-3). */
  const runReconcilePastRetention = async (): Promise<void> => {
    const days = DEFAULT_TEST_LIMITS.trashRetentionDays + 1;
    clock.set(new Date(Date.now() + days * DAY_MS));
    try {
      await runReconcile();
    } finally {
      clock.set(PROBE_CLOCK_START);
    }
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

  /** Líneas del `worker` con `event` y, si se da, del archivo `fileId`. */
  const eventLines = (event: string, fileId?: string): LogLine[] =>
    worker.logs
      .lines()
      .filter((line) => line.event === event && (fileId === undefined || line.fileId === fileId));

  it('014b CA-6, CA-13: purga el original vencido (objeto y fila) sin cambiar `espacio_usado` y lo audita sin nombres ni claves', async () => {
    const fani = await storage.newClient();
    const name = `secreto-${randomUUID()}.txt`;
    const { fileId, originalId, originalKey } = await optimizedFile(fani, name);

    await runReconcile();
    expect(await versionRows(fileId)).toHaveLength(2);

    await runReconcilePastRetention();

    expect((await versionRows(fileId)).map((row) => row.id)).not.toContain(originalId);
    await expect(storage.versionsOf(originalKey)).resolves.toBe(0);
    await expect(usedBytesOf(storage.owner, fani.id)).resolves.toBe(BigInt(OPTIMIZED_BYTES));
    expect(reconcileLines(fani.id)).toEqual([]);
    const pruned = worker.logs
      .lines()
      .filter((line) => line.action === 'file.version_pruned' && line.resourceId === fileId);
    expect(pruned).toEqual([
      expect.objectContaining({
        event: 'audit.record',
        actorId: fani.id,
        attributes: { versionId: originalId, versionNumber: 1, sizeBytes: ORIGINAL_BYTES },
      }),
    ]);
    expect(eventLines('version.pruned', fileId)).toEqual([
      expect.objectContaining({ versionId: originalId, reason: 'kept_expired' }),
    ]);
    expect(eventLines('quota.reconcile_run').at(-1)).toMatchObject({ failed: 0 });
    expect(Number(eventLines('quota.reconcile_run').at(-1)?.keptPurged)).toBeGreaterThanOrEqual(1);
    const logged = JSON.stringify(worker.logs.lines());
    expect(logged).not.toContain(name);
    expect(logged).not.toContain(originalKey);
  });

  it('014b CA-7: si falla el borrado del objeto, la fila y `espacio_usado` no cambian, se registra sin claves y la pasada siguiente lo reintenta', async () => {
    const gabi = await storage.newClient();
    const { fileId, originalId, originalKey } = await optimizedFile(gabi, 'acta.txt');
    failingKeys.add(originalKey);

    await runReconcilePastRetention();

    expect((await versionRows(fileId)).map((row) => row.id)).toContain(originalId);
    await expect(usedBytesOf(storage.owner, gabi.id)).resolves.toBe(BigInt(OPTIMIZED_BYTES));
    expect(eventLines('version.prune_failed', fileId)).toEqual([
      expect.objectContaining({ versionId: originalId, errorName: 'Error' }),
    ]);
    expect(JSON.stringify(worker.logs.lines())).not.toContain(originalKey);

    failingKeys.delete(originalKey);
    await runReconcilePastRetention();

    expect((await versionRows(fileId)).map((row) => row.id)).not.toContain(originalId);
    await expect(usedBytesOf(storage.owner, gabi.id)).resolves.toBe(BigInt(OPTIMIZED_BYTES));
  });

  it('014b CA-9: en la papelera el original vencido se conserva; al restaurar el archivo, la pasada siguiente lo purga', async () => {
    const hugo = await storage.newClient();
    const folder = await hugo.createFolder({ name: `Archivo ${randomUUID()}`, parentId: null });
    expect(folder.status).toBe(201);
    const folderId = (folder.body as { id: string }).id;
    const { fileId, originalId, originalKey } = await optimizedFile(hugo, 'plano.txt', folderId);
    expect((await hugo.trashFolder(folderId)).status).toBe(200);

    await runReconcilePastRetention();

    expect((await versionRows(fileId)).map((row) => row.id)).toContain(originalId);
    await expect(storage.versionsOf(originalKey)).resolves.toBeGreaterThan(0);

    expect((await hugo.restoreFolder(folderId)).status).toBe(200);
    await runReconcilePastRetention();

    expect((await versionRows(fileId)).map((row) => row.id)).not.toContain(originalId);
    await expect(usedBytesOf(storage.owner, hugo.id)).resolves.toBe(BigInt(OPTIMIZED_BYTES));
  });
});
