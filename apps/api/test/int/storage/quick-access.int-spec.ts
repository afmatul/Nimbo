import { randomUUID } from 'node:crypto';

import {
  explorerFolderSchema,
  quickAccessItemSchema,
  quickAccessLimitMessage,
  quickAccessListSchema,
} from '@nimbo/contracts';
import type { QuickAccessList } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';

import { RECENTS_STORED } from '../../../src/modules/storage/application/quick-access-config';
import { FixedClock, Role } from '../../../src/shared';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';

import { createStorageHttpApp, insertCommittedFile } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';
import { insertQuickAccess } from './storage-test-db';

const API_PREFIX = '/api/v1';
const MAX_PINNED = 5;
const RECENT_VISIBLE = 3;
const SECOND_MS = 1000;
/** Espacio usado de sobra para que la purga de los archivos de prueba no lo deje negativo. */
const PURGEABLE_BYTES = 1_000_000;

interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly details?: Record<string, unknown>;
}

/** Fila de `acceso_rapido` leída como el dueño de las tablas (sin RLS). */
interface QuickAccessRow {
  readonly fijado_en: Date | null;
  readonly abierto_en: Date | null;
}

/** Papelera por HTTP de una cuenta de la suite (para ocultar, restaurar y purgar nodos fijados). */
interface TrashRoutes {
  trash(nodeType: 'files' | 'folders', id: string): Promise<Response>;
  restore(nodeType: 'files' | 'folders', id: string): Promise<Response>;
  purge(nodeType: 'files' | 'folders', id: string): Promise<Response>;
}

/** Accesos rápidos por HTTP (spec 006 CA-27 y CA-28, plan §9.2): una prueba por ruta más papelera, purga y tope. */
describe('accesos rápidos por HTTP (006 CA-27, CA-28)', () => {
  let storage: StorageHttpApp;
  let bruno: StorageClient;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      env: {
        QUICK_ACCESS_MAX_PINNED: String(MAX_PINNED),
        QUICK_ACCESS_RECENT_VISIBLE: String(RECENT_VISIBLE),
      },
    });
    bruno = await storage.newClient();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const trashRoutesFor = (userId: string): TrashRoutes => {
    const auth = {
      Authorization: `Bearer ${tokens.valid({ userId, role: Role.CLIENT, sessionId: randomUUID() })}`,
    };
    const http = () => request(storage.testApp.app.getHttpServer());
    return {
      trash: (nodeType, id) => http().delete(`${API_PREFIX}/${nodeType}/${id}`).set(auth),
      restore: (nodeType, id) =>
        http().post(`${API_PREFIX}/trash/${nodeType}/${id}/restore`).set(auth),
      purge: (nodeType, id) => http().delete(`${API_PREFIX}/trash/${nodeType}/${id}`).set(auth),
    };
  };

  const folderOf = async (client: StorageClient, name: string, parentId: string | null = null) => {
    const response = await client.createFolder({ name, parentId });
    expect(response.status).toBe(201);
    return explorerFolderSchema.parse(response.body).id;
  };

  const fileOf = async (client: StorageClient, name: string, folderId: string | null = null) =>
    (await insertCommittedFile(storage.owner, client.id, { name, folderId })).fileId;

  const listOf = async (client: StorageClient): Promise<QuickAccessList> => {
    const response = await client.quickAccess();
    expect(response.status).toBe(200);
    return quickAccessListSchema.parse(response.body);
  };

  const idsOf = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

  const rowsOf = async (userId: string, nodeId: string): Promise<QuickAccessRow[]> =>
    (await storage.owner.query(
      `SELECT fijado_en, abierto_en FROM acceso_rapido
        WHERE usuario_id = $1 AND (archivo_id = $2 OR carpeta_id = $2)`,
      [userId, nodeId],
    )) as QuickAccessRow[];

  const countRows = async (userId: string): Promise<number> => {
    const rows = (await storage.owner.query(
      'SELECT count(*)::int AS total FROM acceso_rapido WHERE usuario_id = $1',
      [userId],
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  /** `insertCommittedFile` no suma a `espacio_usado`; la purga lo resta y no puede quedar negativo. */
  const chargeUsage = async (userId: string): Promise<void> => {
    await storage.owner.query('UPDATE usuario SET espacio_usado = $1 WHERE id = $2', [
      PURGEABLE_BYTES,
      userId,
    ]);
  };

  /** Fija `count` carpetas nuevas de `client`, en orden; devuelve sus ids. */
  const pinFolders = async (client: StorageClient, count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const id = await folderOf(client, `Fijada ${String(index)}`);
      expect((await client.pin('folders', id)).status).toBe(200);
      ids.push(id);
    }
    return ids;
  };

  const expectError = (response: Response, status: number, code: string): ErrorBody => {
    expect(response.status).toBe(status);
    const body = response.body as ErrorBody;
    expect(body).toMatchObject({ code, correlationId: expect.any(String) as string });
    return body;
  };

  /** El mismo 404 para ajeno, inexistente o malformado: solo cambia `correlationId` (CA-22). */
  const withoutCorrelation = (response: Response): Omit<ErrorBody, 'correlationId'> => {
    const { correlationId: _ignored, ...rest } = expectError(
      response,
      404,
      'STORAGE_NODE_NOT_FOUND',
    );
    return rest;
  };

  describe('GET /quick-access', () => {
    it('CA-27: sin marcas devuelve listas vacías', async () => {
      const ana = await storage.newClient();

      await expect(listOf(ana)).resolves.toEqual({ pinned: [], recent: [], hasMoreRecent: false });
    });

    it('CA-27, CA-28: fijados por fecha de fijado, 3 recientes sin los fijados y `hasMoreRecent`', async () => {
      const ana = await storage.newClient();
      const folder = await folderOf(ana, 'Proyectos');
      const pinnedFile = await fileOf(ana, 'plan.pdf');
      const opened = [
        await fileOf(ana, 'a.txt'),
        await fileOf(ana, 'b.txt'),
        await fileOf(ana, 'c.txt'),
        await fileOf(ana, 'd.txt'),
      ];
      await ana.pin('folders', folder);
      await ana.pin('files', pinnedFile);
      for (const id of [...opened, pinnedFile]) {
        expect((await ana.recordOpen('files', id)).status).toBe(204);
      }

      const list = await listOf(ana);

      expect(idsOf(list.pinned)).toEqual([pinnedFile, folder]);
      expect(list.pinned[0]).toMatchObject({ type: 'file', name: 'plan.pdf', kind: 'pdf' });
      expect(list.pinned[1]).toEqual({ type: 'folder', id: folder, name: 'Proyectos' });
      expect(idsOf(list.recent)).toEqual([...opened].reverse().slice(0, RECENT_VISIBLE));
      expect(list.hasMoreRecent).toBe(true);
    });

    it('CA-28: sin token es 401', async () => {
      const anonymous = storage.clientFor(bruno.id);

      expect((await anonymous.quickAccess()).status).toBe(401);
    });
  });

  describe('PUT /quick-access/pins/:nodeType/:nodeId', () => {
    it('CA-28: fija y responde 200 con el elemento; repetido es 200 y no cambia `fijado_en`', async () => {
      const ana = await storage.newClient();
      const folder = await folderOf(ana, 'Contratos');

      const first = await ana.pin('folders', folder);
      const [before] = await rowsOf(ana.id, folder);
      const again = await ana.pin('folders', folder);

      expect(first.status).toBe(200);
      expect(quickAccessItemSchema.parse(first.body)).toEqual({
        type: 'folder',
        id: folder,
        name: 'Contratos',
      });
      expect(again.status).toBe(200);
      expect(await rowsOf(ana.id, folder)).toEqual([before]);
    });

    it('CA-28: el sexto fijado es 422 con `details.maxPinned`; uno ya fijado sigue siendo 200', async () => {
      const ana = await storage.newClient();
      const pinned = await pinFolders(ana, MAX_PINNED);
      const extra = await folderOf(ana, 'Sobra');

      const body = expectError(await ana.pin('folders', extra), 422, 'STORAGE_QUICK_ACCESS_LIMIT');

      expect(body.details).toEqual({ maxPinned: MAX_PINNED });
      expect(body.message).toBe(quickAccessLimitMessage(MAX_PINNED));
      expect(await rowsOf(ana.id, extra)).toEqual([]);
      expect((await ana.pin('folders', pinned[0] ?? '')).status).toBe(200);
    });

    it('CA-28, R-7: `PUT` concurrentes con un solo lugar libre no pasan del tope', async () => {
      const ana = await storage.newClient();
      await pinFolders(ana, MAX_PINNED - 1);
      const candidates = [
        await folderOf(ana, 'Carrera 1'),
        await folderOf(ana, 'Carrera 2'),
        await folderOf(ana, 'Carrera 3'),
      ];

      const responses = await Promise.all(candidates.map((id) => ana.pin('folders', id)));

      expect(responses.map((response) => response.status).sort()).toEqual([200, 422, 422]);
      expect((await listOf(ana)).pinned).toHaveLength(MAX_PINNED);
    });

    it('CA-22, CA-28: ajeno, inexistente, `:nodeType` desconocido o id malformado son el mismo 404', async () => {
      const ana = await storage.newClient();
      const foreign = await folderOf(bruno, 'De Bruno');

      const bodies = [
        withoutCorrelation(await ana.pin('folders', foreign)),
        withoutCorrelation(await ana.pin('folders', randomUUID())),
        withoutCorrelation(await ana.pin('files', foreign)),
        withoutCorrelation(await ana.pin('uploads', foreign)),
        withoutCorrelation(await ana.pin('folders', 'no-es-uuid')),
      ];

      expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
      expect(await rowsOf(ana.id, foreign)).toEqual([]);
    });
  });

  describe('DELETE /quick-access/pins/:nodeType/:nodeId', () => {
    it('CA-28: quitar un fijado nunca abierto responde 204 y borra la fila; repetido sigue siendo 204', async () => {
      const ana = await storage.newClient();
      const [folder = ''] = await pinFolders(ana, 1);

      const removed = await ana.unpin('folders', folder);
      const again = await ana.unpin('folders', folder);

      expect(removed.status).toBe(204);
      expect(removed.text).toBe('');
      expect(again.status).toBe(204);
      expect(await rowsOf(ana.id, folder)).toEqual([]);
    });

    it('CA-27: quitar un fijado que se abrió lo deja como reciente', async () => {
      const ana = await storage.newClient();
      const file = await fileOf(ana, 'informe.docx');
      await ana.pin('files', file);
      await ana.recordOpen('files', file);

      expect((await ana.unpin('files', file)).status).toBe(204);

      const list = await listOf(ana);
      expect(list.pinned).toEqual([]);
      expect(idsOf(list.recent)).toEqual([file]);
    });

    it('CA-22: quitar un nodo ajeno es el mismo 404 y no toca sus filas', async () => {
      const ana = await storage.newClient();
      const foreign = await folderOf(bruno, 'Fijada de Bruno');
      await bruno.pin('folders', foreign);

      expectError(await ana.unpin('folders', foreign), 404, 'STORAGE_NODE_NOT_FOUND');
      expect(await rowsOf(bruno.id, foreign)).toHaveLength(1);
    });
  });

  describe('POST /quick-access/recents/:nodeType/:nodeId', () => {
    it('CA-27: registra la apertura (204, sin cuerpo); en un fijado solo cambia `abierto_en`', async () => {
      const ana = await storage.newClient();
      const folder = await folderOf(ana, 'Abierta');
      const [pinned = ''] = await pinFolders(ana, 1);

      const opened = await ana.recordOpen('folders', folder);
      await ana.recordOpen('folders', pinned);

      expect(opened.status).toBe(204);
      expect(await rowsOf(ana.id, folder)).toEqual([
        { fijado_en: null, abierto_en: expect.any(Date) as Date },
      ]);
      expect(await rowsOf(ana.id, pinned)).toEqual([
        { fijado_en: expect.any(Date) as Date, abierto_en: expect.any(Date) as Date },
      ]);
    });

    it('CA-27: tras abrir, poda a `RECENTS_STORED` recientes y conserva los fijados', async () => {
      const ana = await storage.newClient();
      const [pinned = ''] = await pinFolders(ana, 1);
      const base = Date.now() - RECENTS_STORED * 10 * SECOND_MS;
      for (let index = 0; index < RECENTS_STORED + 3; index += 1) {
        const fileId = await fileOf(ana, `viejo-${String(index)}.txt`);
        await insertQuickAccess(
          storage.owner,
          ana.id,
          { fileId },
          {
            pinnedAt: null,
            openedAt: new Date(base + index * SECOND_MS),
          },
        );
      }
      const fresh = await fileOf(ana, 'nuevo.txt');

      expect((await ana.recordOpen('files', fresh)).status).toBe(204);

      expect(await countRows(ana.id)).toBe(RECENTS_STORED + 1);
      expect(await rowsOf(ana.id, pinned)).toHaveLength(1);
      expect(await rowsOf(ana.id, fresh)).toHaveLength(1);
    });

    it('CA-22: abrir un nodo ajeno es 404 y no crea fila', async () => {
      const ana = await storage.newClient();
      const foreign = await fileOf(bruno, 'ajeno.pdf');

      expectError(await ana.recordOpen('files', foreign), 404, 'STORAGE_NODE_NOT_FOUND');
      expect(await rowsOf(ana.id, foreign)).toEqual([]);
    });
  });

  describe('papelera y purga (plan §9.2)', () => {
    it('CA-28: un fijado en la papelera no aparece ni ocupa tope; al restaurar sus marcas siguen (R-10)', async () => {
      const ana = await storage.newClient();
      const trash = trashRoutesFor(ana.id);
      const [hidden = '', ...rest] = await pinFolders(ana, MAX_PINNED);
      const child = await fileOf(ana, 'dentro.pdf', hidden);
      await ana.recordOpen('files', child);
      expect((await trash.trash('folders', hidden)).status).toBe(200);

      const whileTrashed = await listOf(ana);
      const [sixth = ''] = await pinFolders(ana, 1);
      expect((await trash.restore('folders', hidden)).status).toBe(200);
      const restored = await listOf(ana);

      expect(idsOf(whileTrashed.pinned)).not.toContain(hidden);
      expect(idsOf(whileTrashed.recent)).not.toContain(child);
      expect(idsOf(restored.pinned)).toEqual([...rest, sixth].reverse());
      expect(idsOf(restored.recent)).toEqual([child]);
    });

    it('CA-28: un nodo en la papelera es 404 en las tres rutas con nodo', async () => {
      const ana = await storage.newClient();
      const file = await fileOf(ana, 'borrado.pdf');
      await ana.pin('files', file);
      expect((await trashRoutesFor(ana.id).trash('files', file)).status).toBe(200);

      expectError(await ana.pin('files', file), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await ana.unpin('files', file), 404, 'STORAGE_NODE_NOT_FOUND');
      expectError(await ana.recordOpen('files', file), 404, 'STORAGE_NODE_NOT_FOUND');
      expect(await rowsOf(ana.id, file)).toHaveLength(1);
    });

    it('CA-28: purgar borra las filas por `CASCADE`, también las de lo que arrastró una carpeta', async () => {
      const ana = await storage.newClient();
      const trash = trashRoutesFor(ana.id);
      const file = await fileOf(ana, 'suelto.pdf');
      const folder = await folderOf(ana, 'Caja');
      const inner = await fileOf(ana, 'interno.pdf', folder);
      await ana.pin('files', file);
      await ana.pin('folders', folder);
      await ana.recordOpen('files', inner);
      await trash.trash('files', file);
      await trash.trash('folders', folder);
      await chargeUsage(ana.id);

      expect((await trash.purge('files', file)).status).toBe(200);
      expect((await trash.purge('folders', folder)).status).toBe(200);

      expect(await countRows(ana.id)).toBe(0);
    });
  });

  describe('roles y autenticación (CA-28)', () => {
    it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
      'CA-28: %s recibe 403 en las cuatro rutas',
      async (role) => {
        const internal = await storage.newClient(role);
        const id = randomUUID();

        const responses = [
          await internal.quickAccess(),
          await internal.pin('folders', id),
          await internal.unpin('folders', id),
          await internal.recordOpen('files', id),
        ];

        expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
        responses.forEach((response) => {
          expectError(response, 403, 'SHARED_FORBIDDEN');
        });
      },
    );

    it('CA-28: sin token, las rutas con nodo son 401', async () => {
      const anonymous = storage.clientFor(bruno.id);
      const id = randomUUID();

      const statuses = [
        (await anonymous.pin('folders', id)).status,
        (await anonymous.unpin('folders', id)).status,
        (await anonymous.recordOpen('files', id)).status,
      ];

      expect(statuses).toEqual([401, 401, 401]);
    });

    it('CA-28: las bitácoras no llevan nombres de nodos', () => {
      const lines = JSON.stringify(storage.testApp.logs.lines());

      expect(lines).not.toContain('Contratos');
      expect(lines).not.toContain('informe.docx');
    });
  });
});
