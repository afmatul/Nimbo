import { completeUploadResponseSchema, initUploadResponseSchema } from '@nimbo/contracts';

import {
  countRows,
  createStorageHttpApp,
  insertCommittedFile,
  textBytes,
  uploadBytes,
} from './storage-http';
import type { InitBody, StorageHttpApp } from './storage-http';

const SMALL_BYTES = 256;

/**
 * Nombre repetido en la raíz con la colación real de Postgres (CA-6, RN-5, D-4): 409 con la sugerencia, «Conservar
 * ambos» con el primer «(n)» libre, la papelera no cuenta y el servidor numera la segunda de dos cargas simultáneas.
 */
describe('nombre repetido por HTTP (CA-6)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('CA-6: el mismo nombre con otras mayúsculas es 409 con `suggestedName`, sin crear nada', async () => {
    const client = await storage.newClient();
    await insertCommittedFile(storage.owner, client.id, { name: 'Informe.txt' });

    const response = await client.init({ name: 'informe.txt', sizeBytes: SMALL_BYTES });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'STORAGE_NAME_CONFLICT',
      details: { suggestedName: 'informe (1).txt' },
    });
    expect(await countRows(storage.owner, 'carga', client.id)).toBe(0);
  });

  it('CA-6: «Ñ» y «ñ» chocan (comparación sin mayúsculas, también fuera de ASCII)', async () => {
    const client = await storage.newClient();
    await insertCommittedFile(storage.owner, client.id, { name: 'Ñandú.txt' });

    const response = await client.init({ name: 'ñandú.txt', sizeBytes: SMALL_BYTES });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ details: { suggestedName: 'ñandú (1).txt' } });
  });

  it('CA-6: «Conservar ambos» guarda con el primer «(n)» libre', async () => {
    const client = await storage.newClient();
    await insertCommittedFile(storage.owner, client.id, { name: 'acta.txt' });
    await insertCommittedFile(storage.owner, client.id, { name: 'acta (1).txt' });

    const completed = await client.upload('acta.txt', textBytes(SMALL_BYTES), 'keep_both');

    expect(completed.status).toBe(200);
    expect(completeUploadResponseSchema.parse(completed.body).file.name).toBe('acta (2).txt');
  });

  it('CA-6: un archivo en la papelera no cuenta como repetido', async () => {
    const client = await storage.newClient();
    await insertCommittedFile(storage.owner, client.id, {
      name: 'borrado.txt',
      deletedAt: new Date(),
    });

    const response = await client.init({ name: 'borrado.txt', sizeBytes: SMALL_BYTES });

    expect(response.status).toBe(201);
    expect(initUploadResponseSchema.parse(response.body).name).toBe('borrado.txt');
  });

  it('CA-6: dos cargas simultáneas del mismo nombre: la segunda en completar queda «(1)», sin 409', async () => {
    const client = await storage.newClient();
    const first = await client.init({ name: 'gemelo.txt', sizeBytes: SMALL_BYTES });
    const second = await client.init({ name: 'gemelo.txt', sizeBytes: SMALL_BYTES });
    const bodies = [first.body as InitBody, second.body as InitBody];
    await Promise.all(bodies.map((body) => uploadBytes(body, textBytes(SMALL_BYTES))));

    const completed = await Promise.all(bodies.map((body) => client.complete(body.uploadId)));

    expect(completed.map((response) => response.status)).toEqual([200, 200]);
    const names = completed.map(
      (response) => completeUploadResponseSchema.parse(response.body).file.name,
    );
    expect([...names].sort()).toEqual(['gemelo (1).txt', 'gemelo.txt']);
  });
});
