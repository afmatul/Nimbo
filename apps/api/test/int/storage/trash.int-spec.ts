import { randomUUID } from 'node:crypto';

import {
  folderContentsResponseSchema,
  explorerFolderSchema,
  listTrashResponseSchema,
  restoreResponseSchema,
  trashItemSchema,
  trashSummarySchema,
} from '@nimbo/contracts';
import type { FolderSummary, RestoreResponse, TrashItem } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';

import { FixedClock, Role } from '../../../src/shared';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import type { LogLine } from '../setup/log-sink';

import {
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  insertCommittedFile,
  textBytes,
  usedBytesOf,
} from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const API_PREFIX = '/api/v1';
/** Profundidad máxima del arnés: chica para llegar al tope con pocas carpetas (CA-15). */
const MAX_DEPTH = 3;
const DAY_MS = 86_400_000;
const CORRELATION_HEADER = 'x-correlation-id';

interface ErrorBody {
  readonly code: string;
  readonly correlationId: string;
  readonly details?: Record<string, unknown>;
}

/** Rutas de la papelera con el token de una cuenta de la suite. */
interface TrashClient {
  trashFile(fileId: string): Promise<Response>;
  trashFolder(folderId: string): Promise<Response>;
  list(query?: Record<string, string>): Promise<Response>;
  summary(): Promise<Response>;
  restoreFile(fileId: string): Promise<Response>;
  restoreFolder(folderId: string): Promise<Response>;
}

/** Papelera por HTTP (plan 006 §4): eliminar, listar, resumir y restaurar, con `espacio_usado` y auditoría. */
describe('papelera por HTTP (006 CA-10 a CA-16, CA-24)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let anaTrash: TrashClient;
  let brunoTrash: TrashClient;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  const trashClientFor = (userId: string): TrashClient => {
    const auth = {
      Authorization: `Bearer ${tokens.valid({ userId, role: Role.CLIENT, sessionId: randomUUID() })}`,
    };
    const http = () => request(storage.testApp.app.getHttpServer());
    return {
      trashFile: (fileId) => http().delete(`${API_PREFIX}/files/${fileId}`).set(auth),
      trashFolder: (folderId) => http().delete(`${API_PREFIX}/folders/${folderId}`).set(auth),
      list: (query = {}) => http().get(`${API_PREFIX}/trash`).query(query).set(auth),
      summary: () => http().get(`${API_PREFIX}/trash/summary`).set(auth),
      restoreFile: (fileId) => http().post(`${API_PREFIX}/trash/files/${fileId}/restore`).set(auth),
      restoreFolder: (folderId) =>
        http().post(`${API_PREFIX}/trash/folders/${folderId}/restore`).set(auth),
    };
  };

  beforeAll(async () => {
    storage = await createStorageHttpApp({ env: { FOLDER_MAX_DEPTH: String(MAX_DEPTH) } });
    ana = await storage.newClient();
    const bruno = await storage.newClient();
    anaTrash = trashClientFor(ana.id);
    brunoTrash = trashClientFor(bruno.id);
  });

  afterAll(async () => {
    await storage?.close();
  });

  const folder = async (name: string, parentId: string | null = null): Promise<FolderSummary> => {
    const response = await ana.createFolder({ name, parentId });
    expect(response.status).toBe(201);
    return explorerFolderSchema.parse(response.body);
  };

  const file = async (
    name: string,
    folderId: string | null = null,
    sizeBytes = 100n,
  ): Promise<string> => {
    const { fileId } = await insertCommittedFile(storage.owner, ana.id, {
      name,
      folderId,
      sizeBytes,
    });
    return fileId;
  };

  const trashed = async (pending: Promise<Response>): Promise<TrashItem> => {
    const response = await pending;
    expect(response.status).toBe(200);
    return trashItemSchema.parse(response.body);
  };

  const restored = async (pending: Promise<Response>): Promise<RestoreResponse> => {
    const response = await pending;
    expect(response.status).toBe(200);
    return restoreResponseSchema.parse(response.body);
  };

  const trashIds = async (client: TrashClient): Promise<string[]> => {
    const response = await client.list({ limit: '100' });
    expect(response.status).toBe(200);
    return listTrashResponseSchema.parse(response.body).items.map((item) => item.id);
  };

  const contentIds = async (folderId?: string): Promise<string[]> => {
    const response = await ana.folderContents(folderId === undefined ? {} : { folderId });
    expect(response.status).toBe(200);
    return folderContentsResponseSchema.parse(response.body).items.map((item) => item.id);
  };

  const pathOf = async (folderId: string): Promise<string | undefined> => {
    const rows = (await storage.owner.query('SELECT ruta FROM carpeta WHERE id = $1', [
      folderId,
    ])) as { ruta: string }[];
    return rows[0]?.ruta;
  };

  const expectError = (response: Response, status: number, code: string): ErrorBody => {
    expect(response.status).toBe(status);
    const body = response.body as ErrorBody;
    expect(body).toMatchObject({ code, correlationId: expect.any(String) as string });
    return body;
  };

  const auditLines = (action: string, resourceId: string): LogLine[] =>
    storage.testApp.logs
      .lines()
      .filter(
        (line) =>
          line.event === 'audit.record' && line.action === action && line.resourceId === resourceId,
      );

  describe('DELETE /files/:fileId', () => {
    it('CA-10, CA-24: el archivo sale del explorador, su descarga es 404 y `espacio_usado` no cambia', async () => {
      const uploaded = await ana.upload('nota-secreta-4c1d.txt', textBytes(2048));
      const fileId = (uploaded.body as { file: { id: string } }).file.id;
      const usedBefore = await usedBytesOf(storage.owner, ana.id);

      const response = await anaTrash.trashFile(fileId);
      const item = await trashed(Promise.resolve(response));

      expect(item).toMatchObject({
        id: fileId,
        type: 'file',
        sizeBytes: 2048,
        originalFolder: null,
      });
      expect(Date.parse(item.purgeAt) - Date.parse(item.deletedAt)).toBe(
        DEFAULT_TEST_LIMITS.trashRetentionDays * DAY_MS,
      );
      expectError(await ana.downloadUrl(fileId), 404, 'STORAGE_NODE_NOT_FOUND');
      await expect(contentIds()).resolves.not.toContain(fileId);
      await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(usedBefore);
      expect(auditLines('node.trashed', fileId)).toEqual([
        expect.objectContaining({
          actorId: ana.id,
          attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 2048 },
          correlationId: response.headers[CORRELATION_HEADER] as string,
        }),
      ]);
      expect(JSON.stringify(storage.testApp.logs.lines())).not.toContain('nota-secreta-4c1d');
    });

    it('CA-16, CA-22: un archivo inexistente, ajeno o con id malformado es 404', async () => {
      const fileId = await file('ajeno.pdf');

      expectError(await brunoTrash.trashFile(fileId), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await anaTrash.trashFile(randomUUID()), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await anaTrash.trashFile('no-es-uuid'), 404, 'STORAGE_NODE_NOT_FOUND');
    });
  });

  describe('DELETE /folders/:folderId', () => {
    it('CA-11, CA-12: la carpeta y su subárbol salen; la papelera muestra un solo elemento con la suma', async () => {
      const parent = await folder('Proyectos');
      const child = await folder('Acme', parent.id);
      const inParent = await file('a.pdf', parent.id, 300n);
      const inChild = await file('b.pdf', child.id, 700n);

      const item = await trashed(anaTrash.trashFolder(parent.id));

      expect(item).toMatchObject({ id: parent.id, type: 'folder', sizeBytes: 1000 });
      expect(item.kind).toBeUndefined();
      const ids = await trashIds(anaTrash);
      expect(ids).toContain(parent.id);
      expect(ids).not.toEqual(expect.arrayContaining([child.id]));
      expect(ids).not.toEqual(expect.arrayContaining([inParent]));
      expectError(await ana.folderContents({ folderId: child.id }), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await ana.downloadUrl(inChild), 404, 'STORAGE_NODE_NOT_FOUND');
      expect(auditLines('node.trashed', parent.id)).toEqual([
        expect.objectContaining({
          attributes: { nodeType: 'folder', itemCount: 4, sizeBytes: 1000 },
        }),
      ]);
    });
  });

  describe('GET /trash y /trash/summary', () => {
    it('CA-12: lista de lo más reciente a lo más antiguo, paginada, y resume cantidad, bytes y retención', async () => {
      const summary = trashSummarySchema.parse((await anaTrash.summary()).body);
      const all = listTrashResponseSchema.parse((await anaTrash.list({ limit: '100' })).body).items;

      const first = listTrashResponseSchema.parse((await anaTrash.list({ limit: '1' })).body);
      const second = listTrashResponseSchema.parse(
        (await anaTrash.list({ limit: '1', cursor: first.nextCursor ?? '' })).body,
      );

      expect(summary).toEqual({
        itemCount: all.length,
        totalBytes: all.reduce((sum, item) => sum + item.sizeBytes, 0),
        retentionDays: DEFAULT_TEST_LIMITS.trashRetentionDays,
      });
      expect([...first.items, ...second.items]).toEqual(all.slice(0, 2));
      const order = all.map((item) => [item.deletedAt, item.id].join(' '));
      expect(order).toEqual([...order].sort().reverse());
    });

    it('CA-22: la papelera de otra cuenta no muestra nada de la propia', async () => {
      await expect(trashIds(brunoTrash)).resolves.toEqual([]);
    });
  });

  describe('POST /trash/{files|folders}/:id/restore', () => {
    it('CA-13, CA-24: la carpeta vuelve con lo que arrastró; lo eliminado aparte sigue en la papelera', async () => {
      const target = await folder('Informes');
      const apart = await file('aparte.pdf', target.id);
      const carried = await file('arrastrado.pdf', target.id, 250n);
      await trashed(anaTrash.trashFile(apart));
      await trashed(anaTrash.trashFolder(target.id));

      const result = await restored(anaTrash.restoreFolder(target.id));

      expect(result).toMatchObject({
        outcome: 'restored',
        originalName: 'Informes',
        item: { type: 'folder', id: target.id, parentId: null },
      });
      await expect(contentIds(target.id)).resolves.toEqual([carried]);
      await expect(trashIds(anaTrash)).resolves.toContain(apart);
      expect(auditLines('node.restored', target.id)).toEqual([
        expect.objectContaining({
          attributes: { nodeType: 'folder', itemCount: 2, sizeBytes: 250 },
        }),
      ]);
    });

    it('CA-14: con el nombre ocupado vuelve como «nombre (n)», para carpetas y archivos', async () => {
      const photos = await folder('Fotos');
      await trashed(anaTrash.trashFolder(photos.id));
      await folder('fotos');
      const fileId = await file('acta.pdf');
      await trashed(anaTrash.trashFile(fileId));
      await file('Acta.pdf');

      const folderResult = await restored(anaTrash.restoreFolder(photos.id));
      const fileResult = await restored(anaTrash.restoreFile(fileId));

      expect(folderResult).toMatchObject({ outcome: 'renamed', item: { name: 'Fotos (1)' } });
      expect(fileResult).toMatchObject({
        outcome: 'renamed',
        originalName: 'acta.pdf',
        item: { name: 'acta (1).pdf' },
      });
    });

    it('CA-15: si la carpeta original está en la papelera, el archivo vuelve a la raíz', async () => {
      const parent = await folder('Temporal');
      const fileId = await file('suelto.pdf', parent.id);
      await trashed(anaTrash.trashFile(fileId));
      await trashed(anaTrash.trashFolder(parent.id));

      const result = await restored(anaTrash.restoreFile(fileId));

      expect(result).toMatchObject({ outcome: 'moved_to_root', item: { folderId: null } });
      await expect(contentIds()).resolves.toContain(fileId);
    });

    it('CA-15: si la carpeta original está en la papelera, la carpeta vuelve a la raíz con su subárbol', async () => {
      const parent = await folder('Clientes');
      const target = await folder('Acme', parent.id);
      const child = await folder('2026', target.id);
      const inChild = await file('balance.pdf', child.id);
      await trashed(anaTrash.trashFolder(target.id));
      await trashed(anaTrash.trashFolder(parent.id));

      const result = await restored(anaTrash.restoreFolder(target.id));

      expect(result).toMatchObject({ outcome: 'moved_to_root', item: { parentId: null } });
      await expect(contentIds(child.id)).resolves.toEqual([inChild]);
      await expect(pathOf(child.id)).resolves.toBe(`/${target.id}/${child.id}/`);
    });

    it('R-5: si la carpeta original ya no existe, vuelve a la raíz con la ruta rehecha', async () => {
      const parent = await folder('Purgada');
      const target = await folder('Huérfana', parent.id);
      await trashed(anaTrash.trashFolder(target.id));
      await storage.owner.query('DELETE FROM carpeta WHERE id = $1', [parent.id]);

      const result = await restored(anaTrash.restoreFolder(target.id));

      expect(result.item).toMatchObject({ parentId: null });
      await expect(pathOf(target.id)).resolves.toBe(`/${target.id}/`);
      await expect(contentIds()).resolves.toContain(target.id);
    });

    it('CA-15: si volver a su lugar supera la profundidad máxima, 422 y sigue en la papelera', async () => {
      const top = await folder('Nivel 1');
      const middle = await folder('Nivel 2', top.id);
      await folder('Nivel 3', middle.id);
      await trashed(anaTrash.trashFolder(middle.id));
      const holder = await folder('Contenedor');
      expect((await ana.moveFolder(top.id, { parentId: holder.id })).status).toBe(200);

      const body = expectError(
        await anaTrash.restoreFolder(middle.id),
        422,
        'STORAGE_FOLDER_DEPTH_EXCEEDED',
      );

      expect(body.details).toEqual({ maxDepth: MAX_DEPTH });
      await expect(trashIds(anaTrash)).resolves.toContain(middle.id);
    });

    it('CA-16, CA-22: inexistente, ajeno, vivo o malformado es 404', async () => {
      const live = await file('vivo.pdf');
      const own = await file('propio.pdf');
      await trashed(anaTrash.trashFile(own));

      expectError(await anaTrash.restoreFile(randomUUID()), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await anaTrash.restoreFile(live), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await brunoTrash.restoreFile(own), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await anaTrash.restoreFolder('no-es-uuid'), 404, 'STORAGE_NODE_NOT_FOUND');
    });
  });
});
