import { randomUUID } from 'node:crypto';

import { listTrashResponseSchema, trashSummarySchema } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';

import { accessibleNodes, ownedTrashedNodes } from '../../src/modules/access';
import type { AccessibleNodesFragment } from '../../src/modules/access';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { createStorageHttpApp } from '../int/storage/storage-http';
import type { StorageHttpApp } from '../int/storage/storage-http';

import { createIsolationWorld } from './setup/isolation-world';
import type {
  InternalRole,
  IsolationWorld,
  WorldAccount,
  WorldFile,
  WorldFolder,
  WorldTrash,
} from './setup/isolation-world';

const API_PREFIX = '/api/v1';
const INTERNAL_ROLES: readonly InternalRole[] = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR];
/** Los dos clientes tienen carpetas, archivos y papelera con los mismos nombres (003 CA-10). */
const FOLDER_NAMES = ['Proyectos', 'Facturas'];
const FILE_NAMES = ['Informe anual.txt'];
const TRASH_REQUEST = { files: ['Borrador.txt'], folders: ['Viejos'] };

/** Una petición a una ruta de la spec, sin el token. */
interface RouteCall {
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
  readonly query?: Record<string, string>;
  readonly body?: Record<string, unknown>;
}

/** Nodos de un cliente del mundo. */
interface ClientNodes {
  readonly folders: readonly WorldFolder[];
  readonly files: readonly WorldFile[];
  readonly trash: WorldTrash;
}

/** Lo que un cliente distingue de una respuesta: todo menos el `correlationId` (003 CA-11). */
const comparable = (response: Response) => {
  const { correlationId: _ignored, ...body } = response.body as Record<string, unknown>;
  return { status: response.status, contentType: response.headers['content-type'], body };
};

const first = <T>(items: readonly T[]): T => {
  const [item] = items;
  if (item === undefined) throw new Error('El mundo no tiene el nodo que la prueba necesita');
  return item;
};

/** Ruta que recibe un nodo de A: la etiqueta, qué nodo de A usa y la petición con ese id y los nodos de B. */
type ForeignRoute = readonly [
  label: string,
  target: (a: ClientNodes) => string,
  call: (id: string, own: ClientNodes) => RouteCall,
];

/**
 * Rutas de §4 del plan que reciben un nodo de A: B las llama con ese id y con uno inexistente. Las dos últimas mueven
 * algo **propio** de B a una carpeta de A (CA-22).
 */
const FOREIGN_ROUTES: readonly ForeignRoute[] = [
  [
    'GET /folders/contents?folderId',
    (a) => first(a.folders).id,
    (id) => ({ method: 'get', path: '/folders/contents', query: { folderId: id } }),
  ],
  [
    'POST /folders (crear dentro de una carpeta)',
    (a) => first(a.folders).id,
    (id) => ({ method: 'post', path: '/folders', body: { name: 'Intrusa', parentId: id } }),
  ],
  [
    'PATCH /folders/:id',
    (a) => first(a.folders).id,
    (id) => ({ method: 'patch', path: `/folders/${id}`, body: { name: 'Renombrada' } }),
  ],
  [
    'POST /folders/:id/move',
    (a) => first(a.folders).id,
    (id) => ({ method: 'post', path: `/folders/${id}/move`, body: { parentId: null } }),
  ],
  [
    'DELETE /folders/:id',
    (a) => first(a.folders).id,
    (id) => ({ method: 'delete', path: `/folders/${id}` }),
  ],
  [
    'PATCH /files/:id',
    (a) => first(a.files).id,
    (id) => ({ method: 'patch', path: `/files/${id}`, body: { name: 'Renombrado.txt' } }),
  ],
  [
    'POST /files/:id/move',
    (a) => first(a.files).id,
    (id) => ({ method: 'post', path: `/files/${id}/move`, body: { folderId: null } }),
  ],
  [
    'DELETE /files/:id',
    (a) => first(a.files).id,
    (id) => ({ method: 'delete', path: `/files/${id}` }),
  ],
  [
    'POST /uploads (en una carpeta)',
    (a) => first(a.folders).id,
    (id) => ({
      method: 'post',
      path: '/uploads',
      body: { name: 'nuevo.txt', sizeBytes: 10, folderId: id },
    }),
  ],
  [
    'POST /trash/files/:id/restore',
    (a) => first(a.trash.files).id,
    (id) => ({ method: 'post', path: `/trash/files/${id}/restore` }),
  ],
  [
    'POST /trash/folders/:id/restore',
    (a) => first(a.trash.folders).id,
    (id) => ({ method: 'post', path: `/trash/folders/${id}/restore` }),
  ],
  [
    'DELETE /trash/files/:id',
    (a) => first(a.trash.files).id,
    (id) => ({ method: 'delete', path: `/trash/files/${id}` }),
  ],
  [
    'DELETE /trash/folders/:id',
    (a) => first(a.trash.folders).id,
    (id) => ({ method: 'delete', path: `/trash/folders/${id}` }),
  ],
  [
    'POST /files/:id/move (un archivo propio a una carpeta de A)',
    (a) => first(a.folders).id,
    (id, own) => ({
      method: 'post',
      path: `/files/${first(own.files).id}/move`,
      body: { folderId: id },
    }),
  ],
  [
    'POST /folders/:id/move (una carpeta propia a una carpeta de A)',
    (a) => first(a.folders).id,
    (id, own) => ({
      method: 'post',
      path: `/folders/${first(own.folders).id}/move`,
      body: { parentId: id },
    }),
  ],
];

/** Todas las rutas de §4 del plan, con ids de A (CA-23: el rol o la sesión se rechazan antes de mirar el id). */
const everyRoute = (a: ClientNodes): [string, RouteCall][] => [
  ...FOREIGN_ROUTES.map(([label, target, call]): [string, RouteCall] => [
    label,
    call(target(a), a),
  ]),
  ['GET /folders/contents', { method: 'get', path: '/folders/contents' }],
  ['POST /folders', { method: 'post', path: '/folders', body: { name: 'Nueva', parentId: null } }],
  ['GET /trash', { method: 'get', path: '/trash' }],
  ['GET /trash/summary', { method: 'get', path: '/trash/summary' }],
  ['DELETE /trash', { method: 'delete', path: '/trash' }],
];

/** Estado de los nodos de A que ningún intento de B puede cambiar. */
interface NodeRow {
  readonly id: string;
  readonly nombre: string;
  readonly padre: string | null;
  readonly eliminado_en: Date | null;
  readonly purgar_en: Date | null;
}

/**
 * Aislamiento de carpetas y papelera como `nimbo_app` (006 CA-22, CA-23; RNF-05): lo ajeno responde igual que lo
 * inexistente en todas las rutas de §4 del plan, mover algo propio a una carpeta ajena también, RLS niega las carpetas
 * ajenas aunque la consulta olvide filtrar, y los roles internos y las peticiones sin sesión no llegan a ninguna ruta.
 */
describe('aislamiento de carpetas y papelera (CA-22, CA-23)', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let nodesA: ClientNodes;
  let nodesB: ClientNodes;

  const send = (call: RouteCall, account?: WorldAccount): Promise<Response> => {
    const pending = request(storage.testApp.app.getHttpServer())[call.method](
      `${API_PREFIX}${call.path}`,
    );
    if (account !== undefined) pending.set('Authorization', `Bearer ${world.tokenFor(account)}`);
    if (call.query !== undefined) pending.query(call.query);
    return call.body === undefined ? pending : pending.send(call.body);
  };

  const seed = async (account: WorldAccount): Promise<ClientNodes> => ({
    folders: await world.withFolders(storage.testApp, account, FOLDER_NAMES),
    files: await world.withFiles(storage.testApp, account, FILE_NAMES),
    trash: await world.withTrash(storage.testApp, account, TRASH_REQUEST),
  });

  const folderIdsOf = (nodes: ClientNodes): string[] =>
    [...nodes.folders, ...nodes.trash.folders].map((folder) => folder.id);

  const rowsOfA = async (): Promise<NodeRow[]> =>
    (await storage.owner.query(
      `SELECT id, nombre, carpeta_padre_id AS padre, eliminado_en, purgar_en FROM carpeta WHERE propietario_id = $1
       UNION ALL
       SELECT id, nombre, carpeta_id AS padre, eliminado_en, purgar_en FROM archivo WHERE propietario_id = $1
       ORDER BY id`,
      [a.id],
    )) as NodeRow[];

  let rowsBefore: NodeRow[];

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp();
    [a, b] = world.clients;
    nodesA = await seed(a);
    nodesB = await seed(b);
    rowsBefore = await rowsOfA();
  });

  afterAll(async () => {
    await storage?.close();
    await world?.close();
  });

  describe('lo ajeno responde como inexistente (CA-22)', () => {
    it.each(FOREIGN_ROUTES)(
      'CA-22: %s con un nodo de A como B es el mismo 404 que con un id inexistente',
      async (label, target, call) => {
        const foreign = await send(call(target(nodesA), nodesB), b);
        const missing = await send(call(randomUUID(), nodesB), b);

        expect({ label, status: foreign.status, code: foreign.body.code }).toEqual({
          label,
          status: 404,
          code: 'STORAGE_NODE_NOT_FOUND',
        });
        expect(comparable(foreign)).toEqual(comparable(missing));
        expect(foreign.body.correlationId).not.toBe(missing.body.correlationId);
      },
    );

    it('CA-22: la papelera de B lista y resume solo lo suyo', async () => {
      const list = listTrashResponseSchema.parse(
        (await send({ method: 'get', path: '/trash' }, b)).body,
      );
      const summary = trashSummarySchema.parse(
        (await send({ method: 'get', path: '/trash/summary' }, b)).body,
      );
      const ownTrash = [...nodesB.trash.files, ...nodesB.trash.folders]
        .map((node) => node.id)
        .sort();

      expect(list.items.map((item) => item.id).sort()).toEqual(ownTrash);
      expect(summary.itemCount).toBe(ownTrash.length);
    });

    it('CA-22: B lista su raíz sin ver carpetas ni archivos de A', async () => {
      const response = await send({ method: 'get', path: '/folders/contents' }, b);
      const ids = (response.body as { items: { id: string }[] }).items
        .map((item) => item.id)
        .sort();

      expect(response.status).toBe(200);
      expect(ids).toEqual([...nodesB.folders, ...nodesB.files].map((node) => node.id).sort());
    });

    it('CA-22: vaciar la papelera como B no toca la de A', async () => {
      const response = await send({ method: 'delete', path: '/trash' }, b);

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({ scheduledItems: 2 });
      expect(await rowsOfA()).toEqual(rowsBefore);
    });

    it('CA-22: tras todos los intentos de B, los nodos de A siguen intactos', async () => {
      expect(await rowsOfA()).toEqual(rowsBefore);
      expect((await send({ method: 'get', path: '/folders/contents' }, a)).status).toBe(200);
    });
  });

  describe('RLS de `carpeta` como segunda barrera (CA-22)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;

    const worldFolderIds = (): string[] => [...folderIdsOf(nodesA), ...folderIdsOf(nodesB)];

    const inScope = (actor: Actor, sql: string, parameters: unknown[]): Promise<{ id: string }[]> =>
      runner.withActor(
        actor,
        async () =>
          (await context.requireActorScope(actor).query(sql, parameters)) as { id: string }[],
      );

    /** Carpetas del mundo dentro de `fragment` (`accessibleNodes` u `ownedTrashedNodes`), con el actor. */
    const foldersWithin = (actor: Actor, fragment: AccessibleNodesFragment) =>
      runner.withActor(actor, () =>
        context
          .requireActorScope(actor)
          .createQueryBuilder()
          .select('c.id', 'id')
          .from('carpeta', 'c')
          .where('c.id = ANY(:ids)', { ids: worldFolderIds() })
          .andWhere(
            `c.id IN (SELECT nodo_id FROM (${fragment.sql}) accesibles WHERE tipo_nodo = 'carpeta')`,
            { ...fragment.parameters },
          )
          .getRawMany<{ id: string }>(),
      );

    const idsOf = (rows: readonly { id: string }[]): string[] => rows.map((row) => row.id).sort();

    beforeAll(() => {
      runner = storage.testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
      context = storage.testApp.app.get(TransactionContext);
    });

    it('CA-22: con el actor de B, una consulta de `carpeta` sin `accessibleNodes` no devuelve carpetas de A', async () => {
      const actor = createActor(b.id, Role.CLIENT);

      const rows = await inScope(actor, 'SELECT id FROM carpeta WHERE id = ANY($1)', [
        worldFolderIds(),
      ]);

      expect(idsOf(rows)).toEqual(folderIdsOf(nodesB).sort());
    });

    it('CA-22: con el actor de B, escribir una carpeta a nombre de A lo rechaza la política', async () => {
      const actor = createActor(b.id, Role.CLIENT);
      const id = randomUUID();

      await expect(
        inScope(
          actor,
          `INSERT INTO carpeta (id, propietario_id, nombre, ruta, profundidad, creado_en, actualizado_en)
           VALUES ($1, $2, 'Intrusa', $3, 1, now(), now())`,
          [id, a.id, `/${id}/`],
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('CA-22: `accessibleNodes` da las carpetas vivas del dueño y `ownedTrashedNodes` solo sus raíces de la papelera', async () => {
      const owner = createActor(a.id, Role.CLIENT);

      expect(idsOf(await foldersWithin(owner, accessibleNodes(owner)))).toEqual(
        nodesA.folders.map((folder) => folder.id).sort(),
      );
      expect(idsOf(await foldersWithin(owner, ownedTrashedNodes(owner)))).toEqual(
        nodesA.trash.folders.map((folder) => folder.id).sort(),
      );
    });

    it.each(INTERNAL_ROLES)(
      'CA-23: como %s, `accessibleNodes` y `ownedTrashedNodes` dan 0 carpetas',
      async (role) => {
        const internal = createActor(world.internals[role].id, role);

        await expect(foldersWithin(internal, accessibleNodes(internal))).resolves.toEqual([]);
        await expect(foldersWithin(internal, ownedTrashedNodes(internal))).resolves.toEqual([]);
      },
    );
  });

  describe('roles internos y sin sesión (CA-23)', () => {
    it.each(INTERNAL_ROLES)('CA-23: como %s, todas las rutas responden 403', async (role) => {
      for (const [route, call] of everyRoute(nodesA)) {
        const response = await send(call, world.internals[role]);
        expect({ route, status: response.status, code: response.body.code }).toEqual({
          route,
          status: 403,
          code: 'SHARED_FORBIDDEN',
        });
      }
      expect(await rowsOfA()).toEqual(rowsBefore);
    });

    it('CA-23: sin token, todas las rutas responden 401', async () => {
      for (const [route, call] of everyRoute(nodesA)) {
        const response = await send(call);
        expect({ route, status: response.status, code: response.body.code }).toEqual({
          route,
          status: 401,
          code: 'SHARED_UNAUTHENTICATED',
        });
      }
    });
  });
});
