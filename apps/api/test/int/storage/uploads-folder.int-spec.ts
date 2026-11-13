import { randomUUID } from 'node:crypto';

import {
  completeUploadResponseSchema,
  folderContentsResponseSchema,
  explorerFolderSchema,
  initUploadResponseSchema,
} from '@nimbo/contracts';

import {
  countRows,
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  otherBytes,
  TEST_PART_BYTES,
  textBytes,
  uploadBytes,
  uploadRow,
  usedBytesOf,
} from './storage-http';
import type { InitBody, StorageClient, StorageHttpApp } from './storage-http';

const SMALL_BYTES = 4096;
const MULTIPART_BYTES = 2 * TEST_PART_BYTES + 1_234;

/**
 * Subir a una carpeta por HTTP con MinIO real (006 CA-6): el archivo queda en ella y el nombre repetido se evalúa allí;
 * un destino que no se ve es 404 sin carga; si el destino pasa a la papelera durante la carga, `complete` responde 404,
 * lo subido se borra y la reserva se libera.
 */
describe('POST /uploads con `folderId` (006 CA-6)', () => {
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

  const folderOf = async (client: StorageClient, name: string): Promise<string> => {
    const response = await client.createFolder({ name, parentId: null });
    expect(response.status).toBe(201);
    return explorerFolderSchema.parse(response.body).id;
  };

  const start = async (
    client: StorageClient,
    name: string,
    size: number,
    folderId: string,
  ): Promise<InitBody> => {
    const started = await client.init({ name, sizeBytes: size, folderId });
    expect(started.status).toBe(201);
    return initUploadResponseSchema.parse(started.body) as InitBody;
  };

  /** Lo que haría «Mover a la papelera» en otra petición: la carpeta deja de estar viva. */
  const trashFolder = async (folderId: string): Promise<void> => {
    await storage.owner.query(
      `UPDATE carpeta SET eliminado_en = now(), purgar_en = now() + interval '30 days' WHERE id = $1`,
      [folderId],
    );
  };

  it('CA-6: el archivo queda en la carpeta y se lista en ella, no en la raíz', async () => {
    const client = await storage.newClient();
    const folderId = await folderOf(client, 'Contratos');

    const completed = await client.upload('acta.txt', textBytes(SMALL_BYTES), 'ask', folderId);

    expect(completed.status).toBe(200);
    const { file } = completeUploadResponseSchema.parse(completed.body);
    expect(file.folderId).toBe(folderId);
    const inside = folderContentsResponseSchema.parse(
      (await client.folderContents({ folderId })).body,
    );
    const root = folderContentsResponseSchema.parse((await client.folderContents()).body);
    expect(inside.items.map((item) => item.id)).toEqual([file.id]);
    expect(root.items.map((item) => item.type)).toEqual(['folder']);
  });

  it('CA-6: el nombre repetido se evalúa en la carpeta destino, no en la raíz', async () => {
    const client = await storage.newClient();
    const folderId = await folderOf(client, 'Copias');
    await client.upload('nota.txt', textBytes(SMALL_BYTES));

    const first = await client.init({ name: 'nota.txt', sizeBytes: SMALL_BYTES, folderId });
    await client.upload('nota.txt', textBytes(SMALL_BYTES), 'ask', folderId);
    const second = await client.init({ name: 'NOTA.txt', sizeBytes: SMALL_BYTES, folderId });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      code: 'STORAGE_NAME_CONFLICT',
      details: { suggestedName: 'NOTA (1).txt' },
    });
  });

  it('CA-6: un destino ajeno, inexistente o en la papelera es 404 y no se crea carga', async () => {
    const client = await storage.newClient();
    const other = await storage.newClient();
    const trashed = await folderOf(client, 'Vieja');
    await trashFolder(trashed);
    const destinations = [await folderOf(other, 'Ajena'), randomUUID(), trashed];

    for (const folderId of destinations) {
      const response = await client.init({ name: 'x.txt', sizeBytes: SMALL_BYTES, folderId });
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
    }
    expect(await countRows(storage.owner, 'carga', client.id)).toBe(0);
  });

  it.each([
    ['simple', SMALL_BYTES],
    ['por partes', MULTIPART_BYTES],
  ])(
    'CA-6: si el destino pasa a la papelera durante una carga %s, `complete` es 404, borra lo subido y libera la reserva',
    async (_, size) => {
      const client = await storage.newClient();
      storage.limits.setLimits({ ...DEFAULT_TEST_LIMITS, storageQuotaBytes: BigInt(size) });
      const folderId = await folderOf(client, 'Se va');
      const init = await start(client, 'tarde.bin', size, folderId);
      await uploadBytes(init, otherBytes(size));
      await trashFolder(folderId);

      const completed = await client.complete(init.uploadId);

      expect(completed.status).toBe(404);
      expect(completed.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
      const row = await uploadRow(storage.owner, init.uploadId);
      expect(row.estado).toBe('cancelada');
      expect(await storage.versionsOf(row.clave_objeto)).toBe(0);
      expect(await countRows(storage.owner, 'archivo', client.id)).toBe(0);
      expect(await usedBytesOf(storage.owner, client.id)).toBe(0n);
      expect((await client.init({ name: 'cabe.bin', sizeBytes: size })).status).toBe(201);
      expect((await client.complete(init.uploadId)).status).toBe(404);
    },
  );
});
