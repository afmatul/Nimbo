import {
  completeUploadResponseSchema,
  initUploadResponseSchema,
  listFilesResponseSchema,
} from '@nimbo/contracts';

import {
  createStorageHttpApp,
  putToSignedUrl,
  textBytes,
  uploadRow,
  usedBytesOf,
} from './storage-http';
import type { StorageHttpApp } from './storage-http';

const SMALL_BYTES = 4096;

/** Carga simple de punta a punta por HTTP, con MinIO y Postgres reales (CA-1). */
describe('POST /uploads simple → PUT a MinIO → complete (CA-1)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('CA-1: un archivo bajo el umbral se sube con una URL y queda en la raíz con su tamaño real', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);

    const started = await client.init({ name: 'notas.txt', sizeBytes: bytes.length });
    expect(started.status).toBe(201);
    const init = initUploadResponseSchema.parse(started.body);
    if (init.mode !== 'simple') throw new Error('Se esperaba una carga simple');
    expect(init.name).toBe('notas.txt');
    expect(new URL(init.upload.url).host).toBe(storage.publicHost);

    expect((await putToSignedUrl(init.upload.url, bytes)).status).toBe(200);
    const completed = await client.complete(init.uploadId);

    expect(completed.status).toBe(200);
    const { file } = completeUploadResponseSchema.parse(completed.body);
    expect(file).toMatchObject({ name: 'notas.txt', sizeBytes: SMALL_BYTES, kind: 'texto' });
    const row = await uploadRow(storage.owner, init.uploadId);
    expect(row.estado).toBe('completada');
    expect(row.archivo_id).toBe(file.id);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(SMALL_BYTES));
    expect(await storage.readObject(row.clave_objeto)).toEqual(bytes);
  });

  it('CA-1: el archivo aparece en el listado de la raíz', async () => {
    const client = await storage.newClient();
    const completed = await client.upload('lista.txt', textBytes(SMALL_BYTES));
    const { file } = completeUploadResponseSchema.parse(completed.body);

    const listed = await client.list();

    expect(listed.status).toBe(200);
    const page = listFilesResponseSchema.parse(listed.body);
    expect(page.items).toEqual([file]);
    expect(page.nextCursor).toBeNull();
  });

  it('CA-1: completar otra vez devuelve el mismo archivo y no suma espacio dos veces', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);
    const started = await client.init({ name: 'doble.txt', sizeBytes: bytes.length });
    const init = initUploadResponseSchema.parse(started.body);
    if (init.mode !== 'simple') throw new Error('Se esperaba una carga simple');
    await putToSignedUrl(init.upload.url, bytes);

    const first = await client.complete(init.uploadId);
    const second = await client.complete(init.uploadId);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(SMALL_BYTES));
  });

  it('CA-1: la respuesta nunca expone la clave de objeto', async () => {
    const client = await storage.newClient();

    const completed = await client.upload('secreto.txt', textBytes(SMALL_BYTES));

    expect(completed.status).toBe(200);
    expect(JSON.stringify(completed.body)).not.toContain(`u/${client.id}/`);
  });
});
