import { ListPartsCommand } from '@aws-sdk/client-s3';
import { initUploadResponseSchema } from '@nimbo/contracts';

import {
  countRows,
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  otherBytes,
  putToSignedUrl,
  STORAGE_HTTP_BUCKET,
  TEST_PART_BYTES,
  textBytes,
  uploadBytes,
  uploadRow,
  usedBytesOf,
} from './storage-http';
import type { InitBody, StorageClient, StorageHttpApp } from './storage-http';

const MULTIPART_BYTES = 2 * TEST_PART_BYTES + 4_321;
const SMALL_BYTES = 4096;
/** Vueltas de la carrera `complete` ∥ `cancel`: el ganador varía; el invariante debe valer en todas. */
const RACE_ROUNDS = 6;

/**
 * Cancelar por HTTP con MinIO real (CA-22) y la carrera `complete` ∥ `cancel` (Art. XI): la carga pasa a
 * `cancelada`, lo subido se borra, la reserva se libera y nunca queda un `archivo` sin objeto.
 */
describe('DELETE /uploads/:id y la carrera con complete (CA-22)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  beforeEach(() => {
    storage.limits.setLimits(DEFAULT_TEST_LIMITS);
  });

  afterAll(async () => {
    await storage?.close();
  });

  const start = async (client: StorageClient, name: string, size: number): Promise<InitBody> => {
    const started = await client.init({ name, sizeBytes: size });
    expect(started.status).toBe(201);
    return initUploadResponseSchema.parse(started.body) as InitBody;
  };

  const multipartExists = async (uploadId: string): Promise<boolean> => {
    const row = await uploadRow(storage.owner, uploadId);
    try {
      await storage.s3.send(
        new ListPartsCommand({
          Bucket: STORAGE_HTTP_BUCKET,
          Key: row.clave_objeto,
          UploadId: row.upload_id ?? '',
        }),
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NoSuchUpload') return false;
      throw error;
    }
  };

  it('CA-22: cancelar una carga por partes aborta el multipart, la deja `cancelada` y no registra archivo', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const init = await start(client, 'cancelada.bin', bytes.length);
    await uploadBytes(init, bytes);

    const cancelled = await client.cancel(init.uploadId);

    expect(cancelled.status).toBe(204);
    expect((await uploadRow(storage.owner, init.uploadId)).estado).toBe('cancelada');
    expect(await multipartExists(init.uploadId)).toBe(false);
    expect(await countRows(storage.owner, 'archivo', client.id)).toBe(0);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(0n);
  });

  it('CA-22: cancelar una carga simple ya subida purga el objeto (sin versiones en el bucket versionado)', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);
    const init = await start(client, 'simple.txt', bytes.length);
    await uploadBytes(init, bytes);
    const { clave_objeto: key } = await uploadRow(storage.owner, init.uploadId);
    expect(await storage.versionsOf(key)).toBe(1);

    await client.cancel(init.uploadId);

    expect(await storage.versionsOf(key)).toBe(0);
  });

  it('CA-22: completar o cancelar otra vez una carga cancelada responde 404', async () => {
    const client = await storage.newClient();
    const init = await start(client, 'dos-veces.txt', SMALL_BYTES);
    await client.cancel(init.uploadId);

    const completed = await client.complete(init.uploadId);
    const again = await client.cancel(init.uploadId);

    expect(completed.status).toBe(404);
    expect(completed.body).toMatchObject({ code: 'STORAGE_UPLOAD_NOT_FOUND' });
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ code: 'STORAGE_UPLOAD_NOT_FOUND' });
  });

  it('CA-22, CA-23: pausar (no llamar) conserva la reserva; cancelar la libera para otra carga', async () => {
    storage.limits.setLimits({
      maxFileBytes: DEFAULT_TEST_LIMITS.maxFileBytes,
      storageQuotaBytes: BigInt(SMALL_BYTES + SMALL_BYTES / 2),
      trashRetentionDays: 30,
      retainedVersions: 3,
      readOnly: false,
      maxEditors: 0,
      extraQuotaBytes: 0n,
      extraQuotaUntil: null,
      planName: 'Plan de prueba',
    });
    const client = await storage.newClient();
    const paused = await start(client, 'pausada.txt', SMALL_BYTES);

    const whilePaused = await client.init({ name: 'otra.txt', sizeBytes: SMALL_BYTES });
    expect(whilePaused.status).toBe(422);
    expect(whilePaused.body).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });

    await client.cancel(paused.uploadId);
    const afterCancel = await client.init({ name: 'otra.txt', sizeBytes: SMALL_BYTES });

    expect(afterCancel.status).toBe(201);
  });

  it('Art. XI: `complete` ∥ `cancel` nunca deja un `archivo` sin objeto ni espacio sin archivo', async () => {
    const client = await storage.newClient();
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const bytes = textBytes(SMALL_BYTES);
      const init = await start(client, `carrera-${String(round)}.txt`, bytes.length);
      if (init.mode !== 'simple') throw new Error('Se esperaba una carga simple');
      await putToSignedUrl(init.upload.url, bytes);

      const [completed, cancelled] = await Promise.all([
        client.complete(init.uploadId),
        client.cancel(init.uploadId),
      ]);

      const row = await uploadRow(storage.owner, init.uploadId);
      if (row.estado === 'completada') {
        expect(completed.status).toBe(200);
        expect(cancelled.status).toBe(404);
        expect(await storage.readObject(row.clave_objeto)).toEqual(bytes);
      } else {
        expect(row.estado).toBe('cancelada');
        expect(cancelled.status).toBe(204);
        expect(completed.status).toBe(404);
        expect(await storage.versionsOf(row.clave_objeto)).toBe(0);
      }
    }
    const files = await countRows(storage.owner, 'archivo', client.id);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(files * SMALL_BYTES));
  });
});
