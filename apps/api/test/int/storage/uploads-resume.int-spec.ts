import {
  completeUploadResponseSchema,
  initUploadResponseSchema,
  resumeUploadResponseSchema,
} from '@nimbo/contracts';

import {
  createStorageHttpApp,
  otherBytes,
  putToSignedUrl,
  sha256,
  TEST_PART_BYTES,
  textBytes,
  uploadParts,
  uploadRow,
} from './storage-http';
import type { StorageHttpApp } from './storage-http';

const MULTIPART_BYTES = 2 * TEST_PART_BYTES + 98_765;
const SMALL_BYTES = 8192;

/**
 * Reanudar por HTTP con MinIO real (CA-8): por partes, `resume` informa las partes que MinIO ya tiene y firma solo
 * las que faltan; una simple se sube de nuevo entera. En ambos casos el archivo final es idéntico al original.
 */
describe('POST /uploads/:id/resume (CA-8)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('CA-8: por partes, tras un corte informa las partes recibidas y firma solo las faltantes', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const init = initUploadResponseSchema.parse(
      (await client.init({ name: 'corte.bin', sizeBytes: bytes.length })).body,
    );
    if (init.mode !== 'multipart') throw new Error('Se esperaba una carga por partes');
    await uploadParts(
      init.parts.filter((part) => part.partNumber === 1),
      init.partSizeBytes,
      bytes,
    );

    const resumed = await client.resume(init.uploadId);

    expect(resumed.status).toBe(200);
    const body = resumeUploadResponseSchema.parse(resumed.body);
    if (body.mode !== 'multipart') throw new Error('Se esperaba una carga por partes');
    expect(body.completedParts).toEqual([{ partNumber: 1, sizeBytes: TEST_PART_BYTES }]);
    expect(body.pending.parts.map((part) => part.partNumber)).toEqual([2, 3]);
    expect(body.pending.parts.every((part) => new URL(part.url).host === storage.publicHost)).toBe(
      true,
    );
    await uploadParts(body.pending.parts, body.pending.partSizeBytes, bytes);
    const completed = await client.complete(init.uploadId);

    expect(completed.status).toBe(200);
    const row = await uploadRow(storage.owner, init.uploadId);
    expect(sha256(await storage.readObject(row.clave_objeto))).toBe(sha256(bytes));
  });

  it('CA-8: por partes, reanudar dos veces seguidas no repite partes ya recibidas', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const init = initUploadResponseSchema.parse(
      (await client.init({ name: 'dos-cortes.bin', sizeBytes: bytes.length })).body,
    );
    if (init.mode !== 'multipart') throw new Error('Se esperaba una carga por partes');
    await uploadParts(
      init.parts.filter((part) => part.partNumber !== 2),
      init.partSizeBytes,
      bytes,
    );

    const first = resumeUploadResponseSchema.parse((await client.resume(init.uploadId)).body);
    const second = resumeUploadResponseSchema.parse((await client.resume(init.uploadId)).body);

    if (first.mode !== 'multipart' || second.mode !== 'multipart') {
      throw new Error('Se esperaba una carga por partes');
    }
    expect(first.pending.parts.map((part) => part.partNumber)).toEqual([2]);
    expect(second.pending.parts.map((part) => part.partNumber)).toEqual([2]);
    expect(second.completedParts.map((part) => part.partNumber)).toEqual([1, 3]);
  });

  it('CA-8: una carga simple pausada empieza de cero con una URL nueva y queda idéntica al original', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);
    const init = initUploadResponseSchema.parse(
      (await client.init({ name: 'pausada.txt', sizeBytes: bytes.length })).body,
    );
    if (init.mode !== 'simple') throw new Error('Se esperaba una carga simple');

    const resumed = await client.resume(init.uploadId);

    expect(resumed.status).toBe(200);
    const body = resumeUploadResponseSchema.parse(resumed.body);
    if (body.mode !== 'simple') throw new Error('Se esperaba una carga simple');
    expect(body.completedParts).toEqual([]);
    expect(new URL(body.pending.url).host).toBe(storage.publicHost);
    expect((await putToSignedUrl(body.pending.url, bytes)).status).toBe(200);
    const completed = await client.complete(init.uploadId);

    expect(completed.status).toBe(200);
    const { file } = completeUploadResponseSchema.parse(completed.body);
    expect(file.sizeBytes).toBe(SMALL_BYTES);
    const row = await uploadRow(storage.owner, init.uploadId);
    expect(await storage.readObject(row.clave_objeto)).toEqual(bytes);
  });

  it('CA-8, CA-22: reanudar una carga ya completada o cancelada responde 404', async () => {
    const client = await storage.newClient();
    const completed = await client.init({ name: 'hecha.txt', sizeBytes: SMALL_BYTES });
    const done = initUploadResponseSchema.parse(completed.body);
    if (done.mode !== 'simple') throw new Error('Se esperaba una carga simple');
    await putToSignedUrl(done.upload.url, textBytes(SMALL_BYTES));
    await client.complete(done.uploadId);
    const cancelled = initUploadResponseSchema.parse(
      (await client.init({ name: 'cancelada.txt', sizeBytes: SMALL_BYTES })).body,
    );
    await client.cancel(cancelled.uploadId);

    for (const uploadId of [done.uploadId, cancelled.uploadId]) {
      const response = await client.resume(uploadId);
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'STORAGE_UPLOAD_NOT_FOUND' });
    }
  });
});
