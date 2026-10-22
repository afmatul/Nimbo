import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INDEXING_EVENTS } from '@nimbo/contracts';
import type { Queue } from 'bullmq';

import { IntelligenceModule } from '../../../src/modules/intelligence';
import { I_INDEX_QUEUE } from '../../../src/modules/intelligence/application/ports/i-index-queue.port';
import type { IIndexQueue } from '../../../src/modules/intelligence/application/ports/i-index-queue.port';
import { FILE_VERSION_CREATED } from '../../../src/modules/storage';
import type { FileVersionCreatedEvent } from '../../../src/modules/storage';
import { FileVersionService } from '../../../src/modules/storage/application/file-version.service';
import type { RegisteredVersion } from '../../../src/modules/storage/application/file-version.service';
import {
  editedInput,
  registerAsOwner,
  uploadEditedDocument,
} from '../editing/edited-version-world';
import { settle } from '../realtime/realtime-test-app';
import { waitForLog } from '../setup/wait-for-log';
import { createStorageHttpApp, otherBytes, textBytes } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';

import { eventually, RecordingPublisher, recordingRealtime } from './indexing-world';
import type { Delivered } from './indexing-world';

const INDEXING_QUEUE = 'indexing';
const BODY_BYTES = 2048;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const QUEUED_STATES = ['waiting', 'delayed', 'prioritized', 'active'] as const;

const pngBytes = (): Buffer =>
  Buffer.concat([PNG_SIGNATURE, Buffer.alloc(BODY_BYTES - PNG_SIGNATURE.length, 0x41)]);

interface IndexingRow {
  readonly version_archivo_id: string;
  readonly estado: string;
  readonly motivo: string | null;
}

/**
 * Disparo de la indexación por evento (019 T-05, RN-11, ADR-0019) con `StorageModule` e `IntelligenceModule` reales:
 * Postgres como `nimbo_app` (RLS), MinIO y Redis reales; el canal en vivo es un doble que anota los avisos. Cada camino
 * que deja una versión vigente (carga nueva, reemplazo, restauración y edición) termina en una fila `pendiente`, un
 * trabajo `indexing` con `jobId` = `versionId` y el aviso a la propietaria. Sin `worker`: los trabajos esperan.
 */
describe('versión vigente → indexación programada (019 CA-8, CA-9, CA-22; 016 CA-12)', () => {
  let storage: StorageHttpApp;
  let queue: Queue;
  const publisher = new RecordingPublisher();
  const announced: FileVersionCreatedEvent[] = [];

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      withStorage: (_storage, env) => [
        IntelligenceModule.forRoot(env, { realtime: recordingRealtime(publisher) }),
      ],
    });
    const { app } = storage.testApp;
    queue = app.get<Queue>(getQueueToken(INDEXING_QUEUE));
    app.get(EventEmitter2).on(FILE_VERSION_CREATED, (event: FileVersionCreatedEvent) => {
      announced.push(event);
    });
  });

  afterAll(async () => {
    await queue?.obliterate({ force: true });
    await storage?.close();
  });

  const currentVersionOf = async (fileId: string): Promise<string> => {
    const [row] = await storage.owner.query<{ version_actual_id: string }[]>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [fileId],
    );
    return row?.version_actual_id ?? '';
  };

  const indexingRowsOf = (fileId: string): Promise<IndexingRow[]> =>
    storage.owner.query<IndexingRow[]>(
      'SELECT version_archivo_id, estado, motivo FROM indexacion WHERE archivo_id = $1',
      [fileId],
    );

  const rowOf = async (fileId: string, versionId: string): Promise<IndexingRow | null> =>
    (await indexingRowsOf(fileId)).find((row) => row.version_archivo_id === versionId) ?? null;

  const queuedJobsOf = async (versionId: string) =>
    (await queue.getJobs([...QUEUED_STATES])).filter((job) => job.id === versionId);

  const pendingNoticesOf = (ownerId: string, fileId: string): Delivered[] =>
    publisher.delivered.filter(
      ({ userId, notice }) =>
        userId === ownerId &&
        notice.event === INDEXING_EVENTS.STATUS_CHANGED &&
        (notice.payload as { fileId?: string }).fileId === fileId,
    );

  const uploadedFileId = async (
    client: StorageClient,
    name: string,
    bytes: Buffer,
    onConflict: 'ask' | 'replace' = 'ask',
  ): Promise<string> => {
    const response = await client.upload(name, bytes, onConflict);
    expect(response.status).toBe(200);
    return (response.body as { file: { id: string } }).file.id;
  };

  /** La fila `pendiente`, el trabajo con `jobId` = `versionId` y el aviso de la propietaria. */
  const expectScheduled = async (ownerId: string, fileId: string, versionId: string) => {
    const job = await eventually(async () => (await queue.getJob(versionId)) ?? null);
    expect(job.data).toEqual({ fileId, versionId, ownerId, correlationId: expect.any(String) });
    expect(await rowOf(fileId, versionId)).toEqual({
      version_archivo_id: versionId,
      estado: 'pendiente',
      motivo: null,
    });
    expect(pendingNoticesOf(ownerId, fileId)).toContainEqual({
      userId: ownerId,
      notice: {
        event: INDEXING_EVENTS.STATUS_CHANGED,
        payload: { fileId, state: 'pendiente', reason: null },
      },
    });
  };

  it('CA-8: una carga nueva deja la versión `pendiente`, encolada y avisada', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadedFileId(ana, `notas-${randomUUID()}.txt`, textBytes(BODY_BYTES));

    await expectScheduled(ana.id, fileId, await currentVersionOf(fileId));
  });

  it('CA-8: un reemplazo programa la versión nueva sin tocar la anterior', async () => {
    const ana = await storage.newClient();
    const name = `informe-${randomUUID()}.txt`;
    const fileId = await uploadedFileId(ana, name, textBytes(BODY_BYTES));
    const first = await currentVersionOf(fileId);
    await eventually(() => rowOf(fileId, first));

    await uploadedFileId(ana, name, textBytes(BODY_BYTES, 'otra'), 'replace');

    const second = await currentVersionOf(fileId);
    expect(second).not.toBe(first);
    await expectScheduled(ana.id, fileId, second);
  });

  it('CA-8: restaurar una versión programa la versión nueva de origen `restauracion`', async () => {
    const ana = await storage.newClient();
    const name = `plan-${randomUUID()}.txt`;
    const fileId = await uploadedFileId(ana, name, textBytes(BODY_BYTES));
    const first = await currentVersionOf(fileId);
    await uploadedFileId(ana, name, textBytes(BODY_BYTES, 'otra'), 'replace');

    const response = await ana.restoreVersion(fileId, first);

    expect(response.status).toBe(201);
    const restored = await currentVersionOf(fileId);
    expect(restored).not.toBe(first);
    await expectScheduled(ana.id, fileId, restored);
  });

  it('CA-8, 016 CA-12: la versión de una edición la anuncia `storage` y queda programada con la propietaria', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const input = editedInput(document, bruno.id);

    const outcome = await registerAsOwner(storage, ana.id, input);

    expect(outcome.status).toBe('registered');
    await expectScheduled(ana.id, document.fileId, input.versionId);
  });

  it('RN-11: una transacción revertida no anuncia la versión ni crea fila ni trabajo', async () => {
    const ana = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const input = editedInput(document, ana.id);
    const fileVersions = storage.testApp.app.get(FileVersionService);
    const register = fileVersions.register.bind(fileVersions);
    jest
      .spyOn(fileVersions, 'register')
      .mockImplementationOnce(async (...args): Promise<RegisteredVersion> => {
        await register(...args);
        throw new Error('falla después de registrar');
      });

    await expect(registerAsOwner(storage, ana.id, input)).rejects.toThrow();
    await settle();

    expect(announced.some((event) => event.versionId === input.versionId)).toBe(false);
    expect(await rowOf(document.fileId, input.versionId)).toBeNull();
    expect(await queue.getJob(input.versionId)).toBeUndefined();
  });

  it.each([
    ['una imagen', 'foto.png', pngBytes],
    ['un archivo «otros»', 'datos.bin', () => otherBytes(BODY_BYTES)],
  ])('CA-6: %s se anuncia pero no crea fila, trabajo ni aviso', async (_case, name, bytes) => {
    const ana = await storage.newClient();
    const fileId = await uploadedFileId(ana, `${randomUUID()}-${name}`, bytes());
    const versionId = await currentVersionOf(fileId);
    await eventually(async () => announced.find((event) => event.fileId === fileId) ?? null);
    await settle();

    expect(await indexingRowsOf(fileId)).toEqual([]);
    expect(await queue.getJob(versionId)).toBeUndefined();
    expect(pendingNoticesOf(ana.id, fileId)).toEqual([]);
  });

  it('CA-9: el mismo evento repetido deja una sola fila, un solo trabajo y un solo aviso', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadedFileId(ana, `acta-${randomUUID()}.txt`, textBytes(BODY_BYTES));
    const versionId = await currentVersionOf(fileId);
    const event = await eventually(
      async () => announced.find((candidate) => candidate.versionId === versionId) ?? null,
    );
    await eventually(async () => (await queue.getJob(versionId)) ?? null);

    const emitter = storage.testApp.app.get(EventEmitter2);
    await emitter.emitAsync(FILE_VERSION_CREATED, event);
    await emitter.emitAsync(FILE_VERSION_CREATED, event);

    expect(await indexingRowsOf(fileId)).toHaveLength(1);
    expect(await queuedJobsOf(versionId)).toHaveLength(1);
    expect(pendingNoticesOf(ana.id, fileId)).toHaveLength(1);
  });

  it('RN-5, RN-12: si la cola falla, la carga responde, la fila queda `pendiente` y el fallo consta sin el nombre', async () => {
    const ana = await storage.newClient();
    const indexQueue = storage.testApp.app.get<IIndexQueue>(I_INDEX_QUEUE);
    jest.spyOn(indexQueue, 'enqueue').mockRejectedValueOnce(new Error('Redis no responde'));
    const name = `confidencial-${randomUUID()}.txt`;

    const fileId = await uploadedFileId(ana, name, textBytes(BODY_BYTES));

    const versionId = await currentVersionOf(fileId);
    const line = await waitForLog(
      storage.testApp.logs,
      (candidate) => candidate.event === 'indexing.schedule_failed' && candidate.fileId === fileId,
    );
    expect(line).toMatchObject({ versionId, errorClass: 'Error' });
    expect(JSON.stringify(line)).not.toContain(name);
    expect(await rowOf(fileId, versionId)).toMatchObject({ estado: 'pendiente' });
    expect(await queue.getJob(versionId)).toBeUndefined();
  });
});
