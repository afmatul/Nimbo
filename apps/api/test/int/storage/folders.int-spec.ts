import { randomUUID } from 'node:crypto';

import { folderContentsResponseSchema, folderSummarySchema } from '@nimbo/contracts';
import type { FolderSummary } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { createStorageHttpApp, insertCommittedFile } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

/** Profundidad máxima del arnés: chica para llegar al tope con pocas carpetas (CA-9). */
const MAX_DEPTH = 3;

interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly fields?: { field: string; reason: string }[];
  readonly details?: Record<string, unknown>;
}

const errorOf = (response: Response): ErrorBody => response.body as ErrorBody;

/** Rutas de carpetas por HTTP (plan 006 §4): caso feliz y error principal de cada una. */
describe('carpetas por HTTP (006 CA-1, CA-2, CA-3, CA-5, CA-8, CA-9)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;

  beforeAll(async () => {
    storage = await createStorageHttpApp({ env: { FOLDER_MAX_DEPTH: String(MAX_DEPTH) } });
    ana = await storage.newClient();
    bruno = await storage.newClient();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const created = async (
    client: StorageClient,
    name: string,
    parentId: string | null = null,
  ): Promise<FolderSummary> => {
    const response = await client.createFolder({ name, parentId });
    expect(response.status).toBe(201);
    return folderSummarySchema.parse(response.body);
  };

  const contentsOf = async (client: StorageClient, folderId?: string) => {
    const response = await client.folderContents(folderId === undefined ? {} : { folderId });
    expect(response.status).toBe(200);
    return folderContentsResponseSchema.parse(response.body);
  };

  const expectError = (response: Response, status: number, code: string): ErrorBody => {
    expect(response.status).toBe(status);
    expect(errorOf(response)).toMatchObject({ code, correlationId: expect.any(String) as string });
    return errorOf(response);
  };

  describe('POST /folders', () => {
    it('CA-1: crea una carpeta vacía en la raíz y dentro de otra, con id UUID', async () => {
      const parent = await created(ana, 'Proyectos');

      const child = await created(ana, 'Acme', parent.id);

      expect(parent.parentId).toBeNull();
      expect(child.parentId).toBe(parent.id);
      await expect(contentsOf(ana, child.id)).resolves.toMatchObject({ items: [] });
    });

    it('CA-2: un nombre con separador es 400 `STORAGE_INVALID_NODE_REQUEST` con el campo', async () => {
      const response = await ana.createFolder({ name: 'a/b', parentId: null });

      const body = expectError(response, 400, 'STORAGE_INVALID_NODE_REQUEST');
      expect(body.fields).toEqual([
        expect.objectContaining({ field: 'name', reason: 'INVALID_NAME' }),
      ]);
    });

    it('CA-3: una carpeta hermana con el mismo nombre en otras mayúsculas es 409 `STORAGE_NAME_CONFLICT`', async () => {
      await created(ana, 'Ñandú');

      const response = await ana.createFolder({ name: 'ñANDÚ', parentId: null });

      expectError(response, 409, 'STORAGE_NAME_CONFLICT');
    });

    it('CA-3: un archivo y una carpeta sí comparten nombre en la misma carpeta', async () => {
      await insertCommittedFile(storage.owner, ana.id, { name: 'Compartido' });

      await expect(created(ana, 'Compartido')).resolves.toMatchObject({ name: 'Compartido' });
    });

    it('CA-9: dentro de una carpeta a la profundidad máxima es 422 con `maxDepth`', async () => {
      const first = await created(ana, 'Nivel 1');
      const deepest = await created(ana, 'Nivel 3', (await created(ana, 'Nivel 2', first.id)).id);

      const response = await ana.createFolder({ name: 'Nivel 4', parentId: deepest.id });

      const body = expectError(response, 422, 'STORAGE_FOLDER_DEPTH_EXCEEDED');
      expect(body.details).toEqual({ maxDepth: MAX_DEPTH });
    });

    it('CA-5: dentro de una carpeta ajena es 404 `STORAGE_NODE_NOT_FOUND`', async () => {
      const foreign = await created(bruno, 'De Bruno');

      const response = await ana.createFolder({ name: 'Intrusa', parentId: foreign.id });

      expectError(response, 404, 'STORAGE_NODE_NOT_FOUND');
    });
  });

  describe('GET /folders/contents', () => {
    it('CA-5: lista carpetas primero y luego archivos, con migas desde la raíz', async () => {
      const top = await created(ana, 'Contenido');
      const middle = await created(ana, 'Medio', top.id);
      const file = await insertCommittedFile(storage.owner, ana.id, { folderId: middle.id });
      const leaf = await created(ana, 'Hoja', middle.id);

      const contents = await contentsOf(ana, middle.id);

      expect(contents.folder).toEqual({ id: middle.id, name: 'Medio' });
      expect(contents.breadcrumbs).toEqual([
        { id: top.id, name: 'Contenido' },
        { id: middle.id, name: 'Medio' },
      ]);
      expect(contents.items.map((item) => [item.type, item.id])).toEqual([
        ['folder', leaf.id],
        ['file', file.fileId],
      ]);
    });

    it('CA-5: sin `folderId` lista la raíz, sin carpeta ni migas', async () => {
      const client = await storage.newClient();
      const only = await created(client, 'Única');

      const contents = await contentsOf(client);

      expect(contents).toEqual({
        folder: null,
        breadcrumbs: [],
        items: [{ type: 'folder', ...only }],
        nextCursor: null,
      });
    });

    it.each([
      ['ajena', async (): Promise<string> => (await created(bruno, `B-${randomUUID()}`)).id],
      ['inexistente', (): Promise<string> => Promise.resolve(randomUUID())],
    ])('CA-5: una carpeta %s es 404 `STORAGE_NODE_NOT_FOUND`', async (_, folderIdOf) => {
      const response = await ana.folderContents({ folderId: await folderIdOf() });

      expectError(response, 404, 'STORAGE_NODE_NOT_FOUND');
    });

    it('CA-5: un `folderId` que no es UUID es 400 `STORAGE_INVALID_QUERY`', async () => {
      const response = await ana.folderContents({ folderId: 'raiz' });

      expectError(response, 400, 'STORAGE_INVALID_QUERY');
    });
  });

  describe('PATCH /folders/:folderId', () => {
    it('CA-4: renombra la carpeta y avanza su fecha de modificación (007 `updatedAt`)', async () => {
      const folder = await created(ana, 'Borrador');

      const response = await ana.renameFolder(folder.id, { name: 'Final' });

      expect(response.status).toBe(200);
      const renamed = folderSummarySchema.parse(response.body);
      expect(renamed).toEqual({ ...folder, name: 'Final', updatedAt: renamed.updatedAt });
      expect(Date.parse(renamed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(folder.updatedAt));
    });

    it('CA-3: el nombre de una hermana es 409 y no cambia nada', async () => {
      const parent = await created(ana, 'Hermanas');
      await created(ana, 'Fotos', parent.id);
      const videos = await created(ana, 'Videos', parent.id);

      const response = await ana.renameFolder(videos.id, { name: 'fotos' });

      expectError(response, 409, 'STORAGE_NAME_CONFLICT');
      const names = (await contentsOf(ana, parent.id)).items.map((item) => item.name);
      expect(names.sort()).toEqual(['Fotos', 'Videos']);
    });

    it('CA-2: un nombre vacío es 400 con el campo', async () => {
      const folder = await created(ana, 'Con nombre');

      const response = await ana.renameFolder(folder.id, { name: '   ' });

      const body = expectError(response, 400, 'STORAGE_INVALID_NODE_REQUEST');
      expect(body.fields).toEqual([expect.objectContaining({ field: 'name', reason: 'REQUIRED' })]);
    });

    it('CA-5: un id que no es UUID es el mismo 404 que uno inexistente', async () => {
      const malformed = await ana.renameFolder('no-es-uuid', { name: 'X' });
      const missing = await ana.renameFolder(randomUUID(), { name: 'X' });

      expect(expectError(malformed, 404, 'STORAGE_NODE_NOT_FOUND').message).toBe(
        expectError(missing, 404, 'STORAGE_NODE_NOT_FOUND').message,
      );
    });
  });

  describe('POST /folders/:folderId/move', () => {
    it('CA-7: mueve la carpeta con su contenido: aparece en el destino y deja el origen', async () => {
      const source = await created(ana, 'Mover');
      const child = await created(ana, 'Dentro', source.id);
      const destination = await created(ana, 'Destino');

      const response = await ana.moveFolder(source.id, { parentId: destination.id });

      expect(response.status).toBe(200);
      expect(folderSummarySchema.parse(response.body).parentId).toBe(destination.id);
      expect((await contentsOf(ana, destination.id)).items.map((item) => item.id)).toEqual([
        source.id,
      ]);
      expect((await contentsOf(ana)).items.map((item) => item.id)).not.toContain(source.id);
      expect((await contentsOf(ana, child.id)).breadcrumbs.map((crumb) => crumb.id)).toEqual([
        destination.id,
        source.id,
        child.id,
      ]);
    });

    it('CA-7: mueve a la raíz con `parentId: null`', async () => {
      const source = await created(ana, 'A la raíz', (await created(ana, 'Contenedor')).id);

      const response = await ana.moveFolder(source.id, { parentId: null });

      expect(response.status).toBe(200);
      expect(folderSummarySchema.parse(response.body).parentId).toBeNull();
    });

    it('CA-8: dentro de una descendiente es 422 `STORAGE_INVALID_MOVE` con el mensaje de la spec', async () => {
      const source = await created(ana, 'Ciclo');
      const child = await created(ana, 'Ciclo hija', source.id);

      const response = await ana.moveFolder(source.id, { parentId: child.id });

      const body = expectError(response, 422, 'STORAGE_INVALID_MOVE');
      expect(body.message).toBe('No puedes mover una carpeta dentro de sí misma.');
    });

    it('CA-9: si el subárbol pasaría la profundidad máxima es 422 `STORAGE_FOLDER_DEPTH_EXCEEDED`', async () => {
      const source = await created(ana, 'Alto');
      await created(ana, 'Alto hija', source.id);
      const destination = await created(ana, 'Bajo 2', (await created(ana, 'Bajo 1')).id);

      const response = await ana.moveFolder(source.id, { parentId: destination.id });

      expectError(response, 422, 'STORAGE_FOLDER_DEPTH_EXCEEDED');
    });

    it('CA-3: una carpeta con ese nombre en el destino es 409 y no se fusiona', async () => {
      const destination = await created(ana, 'Con repetida');
      await created(ana, 'Repetida', destination.id);
      const source = await created(ana, 'REPETIDA');

      const response = await ana.moveFolder(source.id, { parentId: destination.id });

      expectError(response, 409, 'STORAGE_NAME_CONFLICT');
      expect((await contentsOf(ana, destination.id)).items).toHaveLength(1);
    });

    it('CA-22: mover algo propio a una carpeta ajena es 404, como a una inexistente', async () => {
      const source = await created(ana, 'Propia');
      const foreign = await created(bruno, 'Ajena');

      const response = await ana.moveFolder(source.id, { parentId: foreign.id });

      expectError(response, 404, 'STORAGE_NODE_NOT_FOUND');
    });
  });
});
