import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { emptyTrashResponseSchema, purgeResponseSchema } from '@nimbo/contracts';
import { QueueEvents } from 'bullmq';
import type { JobsOptions, Queue } from 'bullmq';
import request from 'supertest';
import type { Response } from 'supertest';

import { StorageWorkerModule } from '../../../src/modules/storage';
import { I_OBJECT_STORAGE } from '../../../src/modules/storage/application/ports/i-object-storage.port';
import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from '../../../src/modules/storage/infrastructure/minio-storage.adapter';
import {
  TRASH_PURGE_JOB_NAME,
  TRASH_PURGE_QUEUE,
} from '../../../src/modules/storage/infrastructure/trash-purge.scheduler';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { FixedClock, Role } from '../../../src/shared';
import { buildBullConnection } from '../../../src/shared/infrastructure/queue/bull.config';
import { requiredEnv } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import type { LogLine } from '../setup/log-sink';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { createStorageHttpApp, STORAGE_HTTP_BUCKET, textBytes, usedBytesOf } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const API_PREFIX = '/api/v1';
/** Un día: el programa repetible no corre por su cuenta durante la suite; cada pasada la encola la prueba. */
const PURGE_INTERVAL_MINUTES = '1440';
const JOB_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 200;
/** Una sola pasada, sin reintentos de BullMQ: la prueba ve el fallo tal como queda. */
const SINGLE_ATTEMPT: JobsOptions = { attempts: 1 };
/** Dos intentos casi seguidos: el segundo es el reintento de BullMQ tras el fallo simulado (CA-20). */
const QUICK_RETRY: JobsOptions = { attempts: 2, backoff: { type: 'fixed', delay: 100 } };

/** MinIO real cuyo `purgeObject` falla las próximas `failures` veces, como un MinIO caído a medias (CA-20). */
class FlakyObjectStorage extends MinioStorageAdapter {
  failures = 0;

  override async purgeObject(key: string): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error(`MinIO no respondió al borrar ${key}`);
    }
    await super.purgeObject(key);
  }
}

/** Rutas de la papelera con el token de una cuenta de la suite. */
interface TrashClient {
  trashFile(fileId: string): Promise<Response>;
  trashFolder(folderId: string): Promise<Response>;
  restoreFile(fileId: string): Promise<Response>;
  purgeFile(fileId: string): Promise<Response>;
  purgeFolder(folderId: string): Promise<Response>;
  empty(): Promise<Response>;
}

/**
 * Purga de la papelera de punta a punta (006 CA-16, CA-18 a CA-21, CA-24): la API (`StorageModule`) elimina, restaura,
 * purga y vacía; el `worker` (`StorageWorkerModule`, `nimbo_app` sin actor en la fase 1) consume `trash-purge` contra
 * Postgres, Redis y el MinIO real del arnés (bucket versionado). Los objetos se suben por la API, así que
 * `espacio_usado` y el bucket son los reales.
 */
describe('purga de la papelera de punta a punta (006 CA-18 a CA-21)', () => {
  let storage: StorageHttpApp;
  let worker: TestApp;
  let objects: FlakyObjectStorage;
  let queueEvents: QueueEvents;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  const trashClientFor = (userId: string): TrashClient => {
    const auth = {
      Authorization: `Bearer ${tokens.valid({ userId, role: Role.CLIENT, sessionId: randomUUID() })}`,
    };
    const http = () => request(storage.testApp.app.getHttpServer());
    return {
      trashFile: (fileId) => http().delete(`${API_PREFIX}/files/${fileId}`).set(auth),
      trashFolder: (folderId) => http().delete(`${API_PREFIX}/folders/${folderId}`).set(auth),
      restoreFile: (fileId) => http().post(`${API_PREFIX}/trash/files/${fileId}/restore`).set(auth),
      purgeFile: (fileId) => http().delete(`${API_PREFIX}/trash/files/${fileId}`).set(auth),
      purgeFolder: (folderId) => http().delete(`${API_PREFIX}/trash/folders/${folderId}`).set(auth),
      empty: () => http().delete(`${API_PREFIX}/trash`).set(auth),
    };
  };

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    // El `PinoLogger` de `nestjs-pino` es estático: la última app creada (el `worker`) recibe las bitácoras de ambas.
    const workerEnv = buildTestEnv(
      { MINIO_BUCKET: STORAGE_HTTP_BUCKET, TRASH_PURGE_INTERVAL_MINUTES: PURGE_INTERVAL_MINUTES },
      { withWorkerEnv: true },
    );
    objects = new FlakyObjectStorage(
      buildMinioStorageClients(workerEnv, workerEnv.MINIO_ENDPOINT),
      STORAGE_HTTP_BUCKET,
    );
    worker = await createTestApp({
      validatedEnv: workerEnv,
      modules: [PlanLimitsBindingModule, StorageWorkerModule.forRoot(workerEnv)],
      overrides: [{ provide: I_OBJECT_STORAGE, useValue: objects }],
      prefix: '',
    });
    queueEvents = new QueueEvents(TRASH_PURGE_QUEUE, {
      connection: buildBullConnection(requiredEnv('REDIS_URL')),
    });
    await queueEvents.waitUntilReady();
  });

  afterAll(async () => {
    await queueEvents?.close();
    await worker?.close();
    await storage?.close();
  });

  /** Una pasada del trabajo `trash-purge`, como el programa repetible; espera a que termine (o falle del todo). */
  const runPurge = async (options: JobsOptions = SINGLE_ATTEMPT): Promise<void> => {
    const queue = worker.app.get<Queue>(getQueueToken(TRASH_PURGE_QUEUE));
    const job = await queue.add(TRASH_PURGE_JOB_NAME, { correlationId: randomUUID() }, options);
    await job.waitUntilFinished(queueEvents, JOB_TIMEOUT_MS);
  };

  /** Sube un archivo por la API (objeto real en MinIO) y devuelve su id y su clave de objeto. */
  const uploaded = async (
    client: StorageClient,
    size: number,
    folderId: string | null = null,
  ): Promise<{ fileId: string; key: string }> => {
    const response = await client.upload(
      `informe-${randomUUID()}.txt`,
      textBytes(size),
      'ask',
      folderId,
    );
    expect(response.status).toBe(200);
    const fileId = (response.body as { file: { id: string } }).file.id;
    const rows = (await storage.owner.query(
      'SELECT clave_objeto FROM version_archivo WHERE archivo_id = $1',
      [fileId],
    )) as { clave_objeto: string }[];
    return { fileId, key: rows[0]?.clave_objeto ?? '' };
  };

  const fileExists = async (fileId: string): Promise<boolean> => {
    const rows = (await storage.owner.query('SELECT 1 FROM archivo WHERE id = $1', [
      fileId,
    ])) as unknown[];
    return rows.length > 0;
  };

  const folderExists = async (folderId: string): Promise<boolean> => {
    const rows = (await storage.owner.query('SELECT 1 FROM carpeta WHERE id = $1', [
      folderId,
    ])) as unknown[];
    return rows.length > 0;
  };

  /** Como si hubiera pasado la retención: la fecha de purga de la raíz queda en el pasado (CA-19). */
  const expire = async (table: 'archivo' | 'carpeta', id: string): Promise<void> => {
    await storage.owner.query(
      `UPDATE ${table} SET purgar_en = now() - interval '1 minute' WHERE id = $1`,
      [id],
    );
  };

  const expectStatus = async (pending: Promise<Response>, status: number): Promise<Response> => {
    const response = await pending;
    expect(response.status).toBe(status);
    return response;
  };

  const auditLines = (action: string, resourceId?: string): LogLine[] =>
    worker.logs
      .lines()
      .filter(
        (line) =>
          line.event === 'audit.record' &&
          line.action === action &&
          (resourceId === undefined || line.resourceId === resourceId),
      );

  const waitFor = async (condition: () => Promise<boolean>): Promise<void> => {
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error('La condición no se cumplió a tiempo');
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  };

  it('CA-19, CA-24: la pasada programada purga lo vencido (objeto, filas y bytes) y no toca lo que no venció', async () => {
    const ana = await storage.newClient();
    const trash = trashClientFor(ana.id);
    const due = await uploaded(ana, 2048);
    const notDue = await uploaded(ana, 1024);
    await expectStatus(trash.trashFile(due.fileId), 200);
    await expectStatus(trash.trashFile(notDue.fileId), 200);
    await expire('archivo', due.fileId);

    await runPurge();

    await expect(fileExists(due.fileId)).resolves.toBe(false);
    await expect(storage.versionsOf(due.key)).resolves.toBe(0);
    await expect(fileExists(notDue.fileId)).resolves.toBe(true);
    await expect(storage.versionsOf(notDue.key)).resolves.toBeGreaterThan(0);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(1024n);
    expect(auditLines('node.purged', due.fileId)).toEqual([
      expect.objectContaining({
        actorId: ana.id,
        attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 2048, trigger: 'scheduled' },
      }),
    ]);
    expect(auditLines('node.purged', notDue.fileId)).toEqual([]);
  });

  it('CA-19: una carpeta vencida se purga con todo su contenido aunque la cuenta no esté activa; lo eliminado aparte se queda', async () => {
    const ana = await storage.newClient();
    const trash = trashClientFor(ana.id);
    const folder = (
      await expectStatus(ana.createFolder({ name: 'Proyectos', parentId: null }), 201)
    ).body as { id: string };
    const child = (await expectStatus(ana.createFolder({ name: 'Acme', parentId: folder.id }), 201))
      .body as { id: string };
    const first = await uploaded(ana, 300, folder.id);
    const second = await uploaded(ana, 700, child.id);
    const apart = await uploaded(ana, 50, child.id);
    await expectStatus(trash.trashFile(apart.fileId), 200);
    await expectStatus(trash.trashFolder(folder.id), 200);
    await expire('carpeta', folder.id);
    // Aún no existe la suscripción (004): «suspendida» es el estado de cuenta que la purga tampoco debe mirar.
    await storage.owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [ana.id]);

    await runPurge();

    await expect(folderExists(folder.id)).resolves.toBe(false);
    await expect(folderExists(child.id)).resolves.toBe(false);
    await expect(fileExists(first.fileId)).resolves.toBe(false);
    await expect(fileExists(second.fileId)).resolves.toBe(false);
    await expect(storage.versionsOf(first.key)).resolves.toBe(0);
    await expect(storage.versionsOf(second.key)).resolves.toBe(0);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(50n);
    // R-5: lo eliminado aparte sigue en la papelera, ahora sin carpeta original (`SET NULL`).
    const rows = (await storage.owner.query(
      'SELECT carpeta_id, eliminado_en FROM archivo WHERE id = $1',
      [apart.fileId],
    )) as { carpeta_id: string | null; eliminado_en: Date | null }[];
    expect(rows).toEqual([{ carpeta_id: null, eliminado_en: expect.any(Date) as Date }]);
  });

  it('CA-20: si MinIO falla, el archivo y `espacio_usado` no cambian, el trabajo falla y el reintento lo purga', async () => {
    const ana = await storage.newClient();
    const trash = trashClientFor(ana.id);
    const target = await uploaded(ana, 4096);
    await expectStatus(trash.trashFile(target.fileId), 200);
    await expire('archivo', target.fileId);
    objects.failures = 1;

    await expect(runPurge()).rejects.toThrow();

    await expect(fileExists(target.fileId)).resolves.toBe(true);
    await expect(storage.versionsOf(target.key)).resolves.toBeGreaterThan(0);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(4096n);
    const failures = worker.logs.lines().filter((line) => line.event === 'trash.purge_failed');
    expect(failures).toEqual([
      expect.objectContaining({ nodeId: target.fileId, errorName: 'Error' }),
    ]);
    expect(JSON.stringify(failures)).not.toContain(target.key);

    objects.failures = 1;
    await runPurge(QUICK_RETRY);

    await expect(fileExists(target.fileId)).resolves.toBe(false);
    await expect(storage.versionsOf(target.key)).resolves.toBe(0);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(0n);
  });

  it('CA-16, CA-18, CA-24: eliminar → restaurar → eliminar → purgar; `espacio_usado` solo baja al purgar', async () => {
    const ana = await storage.newClient();
    const trash = trashClientFor(ana.id);
    const target = await uploaded(ana, 2048);
    const used = () => usedBytesOf(storage.owner, ana.id);

    await expectStatus(trash.trashFile(target.fileId), 200);
    await expect(used()).resolves.toBe(2048n);
    await expectStatus(trash.restoreFile(target.fileId), 200);
    await expect(used()).resolves.toBe(2048n);
    await expectStatus(trash.trashFile(target.fileId), 200);
    await expect(used()).resolves.toBe(2048n);
    const response = await expectStatus(trash.purgeFile(target.fileId), 200);

    expect(purgeResponseSchema.parse(response.body)).toEqual({ freedBytes: 2048 });
    await expect(used()).resolves.toBe(0n);
    await expect(storage.versionsOf(target.key)).resolves.toBe(0);
    expect(auditLines('node.purged', target.fileId)).toEqual([
      expect.objectContaining({
        attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 2048, trigger: 'manual' },
      }),
    ]);
    expect((await trash.purgeFile(target.fileId)).status).toBe(404);
    expect((await trash.purgeFolder(randomUUID())).status).toBe(404);
  });

  it('CA-18, CA-24: vaciar responde 202 sin purgar en la petición; el trabajo encolado purga todo', async () => {
    const ana = await storage.newClient();
    const trash = trashClientFor(ana.id);
    const first = await uploaded(ana, 1000);
    const second = await uploaded(ana, 3000);
    await expectStatus(trash.trashFile(first.fileId), 200);
    await expectStatus(trash.trashFile(second.fileId), 200);

    const response = await expectStatus(trash.empty(), 202);

    expect(emptyTrashResponseSchema.parse(response.body)).toEqual({
      scheduledItems: 2,
      pendingBytes: 4000,
    });
    expect(auditLines('trash.emptied')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorId: ana.id, attributes: { itemCount: 2, sizeBytes: 4000 } }),
      ]),
    );
    await waitFor(async () => (await usedBytesOf(storage.owner, ana.id)) === 0n);
    await expect(fileExists(first.fileId)).resolves.toBe(false);
    await expect(fileExists(second.fileId)).resolves.toBe(false);
    await expect(storage.versionsOf(second.key)).resolves.toBe(0);
  });
});
