import { randomUUID } from 'node:crypto';

import { quickAccessListSchema } from '@nimbo/contracts';
import type { QuickAccessList } from '@nimbo/contracts';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { RECENTS_STORED } from '../../src/modules/storage/application/quick-access-config';
import {
  buildDataSourceOptions,
  createActor,
  I_TRANSACTION_RUNNER,
  Role,
  TransactionContext,
} from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { createStorageHttpApp } from '../int/storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../int/storage/storage-http';
import { insertQuickAccess } from '../int/storage/storage-test-db';
import { requiredEnv } from '../support/database-urls';

import { createIsolationWorld } from './setup/isolation-world';
import type {
  InternalRole,
  IsolationWorld,
  WorldAccount,
  WorldFile,
  WorldFolder,
  WorldNodeRef,
} from './setup/isolation-world';

const INTERNAL_ROLES: readonly InternalRole[] = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR];
/** Los dos clientes tienen carpetas y archivos con los mismos nombres (003 CA-10). */
const FOLDER_NAMES = ['Proyectos', 'Facturas'];
const FILE_NAMES = ['Informe anual.txt', 'Notas.txt'];

/** Nodos de un cliente del mundo: `[0]` es lo que fija y `[1]` lo que solo abre. */
interface ClientNodes {
  readonly folders: readonly WorldFolder[];
  readonly files: readonly WorldFile[];
}

/** Fila de `acceso_rapido` vista por el dueño de las tablas (sin RLS): lo que ningún intento de B puede cambiar. */
interface QuickAccessRow {
  readonly id: string;
  readonly archivo_id: string | null;
  readonly carpeta_id: string | null;
  readonly fijado_en: Date | null;
  readonly abierto_en: Date | null;
  readonly actualizado_en: Date;
}

/** Lo que un cliente distingue de una respuesta: todo menos el `correlationId` (003 CA-11). */
const comparable = (response: Response) => {
  const { correlationId: _ignored, ...body } = response.body as Record<string, unknown>;
  return { status: response.status, contentType: response.headers['content-type'], body };
};

const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error('El mundo no tiene el nodo que la prueba necesita');
  return item;
};

const folderRef = (folder: WorldFolder): WorldNodeRef => ({ type: 'folder', id: folder.id });
const fileRef = (file: WorldFile): WorldNodeRef => ({ type: 'file', id: file.id });

/** Segmento `:nodeType` de la ruta de un nodo. */
const pathOf = (ref: WorldNodeRef): string => (ref.type === 'file' ? 'files' : 'folders');

type NodeCall = (client: StorageClient, nodeType: string, id: string) => Promise<Response>;

/** Las tres rutas que reciben un nodo, con el nodo de A que cada una ataca. */
const NODE_ROUTES: readonly (readonly [
  label: string,
  call: NodeCall,
  target: (a: ClientNodes) => WorldNodeRef,
])[] = [
  [
    'PUT /pins/folders (no fijada por A)',
    (c, t, id) => c.pin(t, id),
    (a) => folderRef(at(a.folders, 1)),
  ],
  ['PUT /pins/files (no fijado por A)', (c, t, id) => c.pin(t, id), (a) => fileRef(at(a.files, 1))],
  [
    'DELETE /pins/folders (fijada por A)',
    (c, t, id) => c.unpin(t, id),
    (a) => folderRef(at(a.folders, 0)),
  ],
  [
    'DELETE /pins/files (fijado por A)',
    (c, t, id) => c.unpin(t, id),
    (a) => fileRef(at(a.files, 0)),
  ],
  ['POST /recents/folders', (c, t, id) => c.recordOpen(t, id), (a) => folderRef(at(a.folders, 0))],
  ['POST /recents/files', (c, t, id) => c.recordOpen(t, id), (a) => fileRef(at(a.files, 1))],
];

/**
 * Aislamiento de los accesos rápidos como `nimbo_app` (006 CA-28, RNF-05; plan §9.2): B no ve, fija, quita ni registra
 * nada sobre nodos de A (el mismo 404 que lo inexistente), sus escrituras y su poda no tocan las filas de A, RLS de
 * `acceso_rapido` niega las filas ajenas aunque la consulta olvide filtrar, y los roles internos y las peticiones sin
 * sesión no llegan a ninguna ruta. Sin comparticiones: llegan con 012.
 */
describe('aislamiento de accesos rápidos (CA-28, RNF-05)', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let nodesA: ClientNodes;
  let nodesB: ClientNodes;
  let rowsBefore: QuickAccessRow[];

  const routesOf = (account?: WorldAccount): StorageClient =>
    storage.clientFor(
      account?.id ?? randomUUID(),
      account === undefined ? undefined : world.tokenFor(account),
    );

  const idsOfNodes = (nodes: ClientNodes): string[] =>
    [...nodes.folders, ...nodes.files].map((node) => node.id);

  const rowsOf = async (account: WorldAccount): Promise<QuickAccessRow[]> =>
    (await storage.owner.query(
      `SELECT id, archivo_id, carpeta_id, fijado_en, abierto_en, actualizado_en
         FROM acceso_rapido WHERE usuario_id = $1 ORDER BY id`,
      [account.id],
    )) as QuickAccessRow[];

  /** Filas de B que señalan un nodo de A (no debe haber ninguna). */
  const rowsOfBOnNodesOfA = async (): Promise<number> => {
    const rows = (await storage.owner.query(
      `SELECT count(*)::int AS total FROM acceso_rapido
        WHERE usuario_id = $1 AND (archivo_id = ANY($2) OR carpeta_id = ANY($2))`,
      [b.id, idsOfNodes(nodesA)],
    )) as { total: number }[];
    return rows[0]?.total ?? -1;
  };

  const listOf = async (account: WorldAccount): Promise<QuickAccessList> => {
    const response = await routesOf(account).quickAccess();
    expect(response.status).toBe(200);
    return quickAccessListSchema.parse(response.body);
  };

  const seed = async (account: WorldAccount): Promise<ClientNodes> => {
    const nodes = {
      folders: await world.withFolders(storage.testApp, account, FOLDER_NAMES),
      files: await world.withFiles(storage.testApp, account, FILE_NAMES),
    };
    await world.withQuickAccess(storage.testApp, account, {
      pinned: [folderRef(at(nodes.folders, 0)), fileRef(at(nodes.files, 0))],
      opened: [
        folderRef(at(nodes.folders, 1)),
        fileRef(at(nodes.files, 1)),
        fileRef(at(nodes.files, 0)),
      ],
    });
    return nodes;
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp();
    [a, b] = world.clients;
    nodesA = await seed(a);
    nodesB = await seed(b);
    rowsBefore = await rowsOf(a);
  });

  afterAll(async () => {
    await storage?.close();
    await world?.close();
  });

  describe('lo ajeno responde como inexistente (CA-28, CA-22)', () => {
    it('CA-28: B no ve en GET /quick-access ningún nodo de A aunque A fijó y abrió nodos de igual nombre', async () => {
      const listA = await listOf(a);
      const listB = await listOf(b);
      const idsB = [...listB.pinned, ...listB.recent].map((item) => item.id);

      expect(listA.pinned).toHaveLength(2);
      expect(listA.recent).toHaveLength(2);
      expect(idsB.filter((id) => idsOfNodes(nodesA).includes(id))).toEqual([]);
      expect(listB.pinned.map((item) => item.id)).toEqual([
        at(nodesB.files, 0).id,
        at(nodesB.folders, 0).id,
      ]);
      expect(listB.recent.map((item) => item.id)).toEqual([
        at(nodesB.files, 1).id,
        at(nodesB.folders, 1).id,
      ]);
    });

    it.each(NODE_ROUTES)(
      'CA-28: B no puede usar %s sobre un nodo de A: el mismo 404 que con un id inexistente',
      async (label, call, target) => {
        const ref = target(nodesA);
        const foreign = await call(routesOf(b), pathOf(ref), ref.id);
        const missing = await call(routesOf(b), pathOf(ref), randomUUID());

        expect({ label, status: foreign.status, code: foreign.body.code }).toEqual({
          label,
          status: 404,
          code: 'STORAGE_NODE_NOT_FOUND',
        });
        expect(comparable(foreign)).toEqual(comparable(missing));
        expect(foreign.body.correlationId).not.toBe(missing.body.correlationId);
      },
    );

    it('CA-28: B no puede quitar «su» fijado con el id de un fijado de A: A y B no cambian', async () => {
      const ownBefore = await rowsOf(b);
      const ref = folderRef(at(nodesA.folders, 0));

      const response = await routesOf(b).unpin(pathOf(ref), ref.id);

      expect(response.status).toBe(404);
      expect(await rowsOf(b)).toEqual(ownBefore);
      expect(await rowsOf(a)).toEqual(rowsBefore);
    });

    it('CA-28: tras todos los intentos de B, las filas de A siguen intactas y B no tiene filas sobre nodos de A', async () => {
      expect(await rowsOf(a)).toEqual(rowsBefore);
      expect(await rowsOfBOnNodesOfA()).toBe(0);
      expect((await listOf(a)).pinned).toHaveLength(2);
    });
  });

  describe('RLS de `acceso_rapido` como segunda barrera (CA-28)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;

    const inScope = <T>(actor: Actor, sql: string, parameters: unknown[]): Promise<T[]> =>
      runner.withActor(
        actor,
        async () => (await context.requireActorScope(actor).query(sql, parameters)) as T[],
      );

    beforeAll(() => {
      runner = storage.testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
      context = storage.testApp.app.get(TransactionContext);
    });

    it('CA-28: `nimbo_app` sin actor no ve ni modifica filas de `acceso_rapido` por consulta directa', async () => {
      const bare = await new DataSource(
        buildDataSourceOptions({ DATABASE_URL: requiredEnv('DATABASE_URL') }),
      ).initialize();
      try {
        const owners = [a.id, b.id];
        const seen = (await bare.query(
          'SELECT count(*)::int AS total FROM acceso_rapido WHERE usuario_id = ANY($1)',
          [owners],
        )) as { total: number }[];
        const touched = (await bare.query(
          'UPDATE acceso_rapido SET fijado_en = now() WHERE usuario_id = ANY($1) RETURNING id',
          [owners],
        )) as unknown[];

        expect(seen[0]?.total).toBe(0);
        expect(touched).toEqual([[], 0]);
      } finally {
        await bare.destroy();
      }
      expect(await rowsOf(a)).toEqual(rowsBefore);
    });

    it('CA-28: con el actor de B, una consulta de `acceso_rapido` sin filtro de cuenta solo devuelve filas de B', async () => {
      const actor = createActor(b.id, Role.CLIENT);

      const rows = await inScope<{ usuario_id: string }>(
        actor,
        'SELECT usuario_id FROM acceso_rapido WHERE usuario_id = ANY($1)',
        [[a.id, b.id]],
      );

      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((row) => row.usuario_id))).toEqual(new Set([b.id]));
    });

    it('CA-28: con el actor de B, actualizar o borrar filas de A por SQL directo no afecta ninguna', async () => {
      const actor = createActor(b.id, Role.CLIENT);

      const updated = await inScope(
        actor,
        'UPDATE acceso_rapido SET fijado_en = NULL, abierto_en = now() WHERE usuario_id = $1 RETURNING id',
        [a.id],
      );
      const deleted = await inScope(
        actor,
        'DELETE FROM acceso_rapido WHERE usuario_id = $1 RETURNING id',
        [a.id],
      );

      expect(updated).toEqual([[], 0]);
      expect(deleted).toEqual([[], 0]);
      expect(await rowsOf(a)).toEqual(rowsBefore);
    });

    it('CA-28: con el actor de B, insertar una fila a nombre de A lo rechaza la política', async () => {
      const actor = createActor(b.id, Role.CLIENT);

      await expect(
        inScope(
          actor,
          `INSERT INTO acceso_rapido (id, usuario_id, carpeta_id, fijado_en, creado_en, actualizado_en)
           VALUES ($1, $2, $3, now(), now(), now())`,
          [randomUUID(), a.id, at(nodesA.folders, 1).id],
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it.each(INTERNAL_ROLES)(
      'CA-28: como %s, `acceso_rapido` da 0 filas por consulta directa',
      async (role) => {
        const internal = createActor(world.internals[role].id, role);

        await expect(
          inScope(internal, 'SELECT id FROM acceso_rapido WHERE usuario_id = ANY($1)', [
            [a.id, b.id],
          ]),
        ).resolves.toEqual([]);
      },
    );
  });

  describe('filas de B sobre nodos de A y poda (CA-28)', () => {
    it('CA-28: aunque exista una fila de B que señale nodos de A, B no los ve ni puede operarlos', async () => {
      const poisoned = [
        await insertQuickAccess(storage.owner, b.id, { fileId: at(nodesA.files, 1).id }),
        await insertQuickAccess(
          storage.owner,
          b.id,
          { folderId: at(nodesA.folders, 1).id },
          {
            pinnedAt: null,
            openedAt: new Date(Date.now() + 60_000),
          },
        ),
      ];
      try {
        const list = await listOf(b);
        const ref = fileRef(at(nodesA.files, 1));
        const unpin = await routesOf(b).unpin(pathOf(ref), ref.id);

        expect(
          [...list.pinned, ...list.recent].filter((i) => idsOfNodes(nodesA).includes(i.id)),
        ).toEqual([]);
        expect(list.pinned).toHaveLength(2);
        expect(comparable(unpin)).toEqual(
          comparable(await routesOf(b).unpin(pathOf(ref), randomUUID())),
        );
      } finally {
        await storage.owner.query('DELETE FROM acceso_rapido WHERE id = ANY($1)', [poisoned]);
      }
      expect(await rowsOf(a)).toEqual(rowsBefore);
    });

    it('CA-28: la poda de recientes de B al registrar una apertura no borra filas de A', async () => {
      const extra = await world.withFiles(
        storage.testApp,
        b,
        Array.from({ length: RECENTS_STORED + 1 }, (_, index) => `reciente-${String(index)}.txt`),
      );
      await world.withQuickAccess(storage.testApp, b, { opened: extra.map(fileRef) });

      const ref = folderRef(at(nodesB.folders, 1));
      const response = await routesOf(b).recordOpen(pathOf(ref), ref.id);
      const recentOfB = (await rowsOf(b)).filter((row) => row.fijado_en === null);

      expect(response.status).toBe(204);
      expect(recentOfB).toHaveLength(RECENTS_STORED);
      expect(await rowsOf(a)).toEqual(rowsBefore);
    });
  });

  describe('roles internos y sin sesión (CA-28, CA-23)', () => {
    /** Las 4 rutas (con los dos tipos de nodo) contra nodos de A. */
    const everyRoute = (): [string, (client: StorageClient) => Promise<Response>][] => [
      ['GET /quick-access', (client) => client.quickAccess()],
      ...NODE_ROUTES.map(
        ([label, call, target]): [string, (client: StorageClient) => Promise<Response>] => {
          const ref = target(nodesA);
          return [label, (client) => call(client, pathOf(ref), ref.id)];
        },
      ),
    ];

    it.each(INTERNAL_ROLES)(
      'CA-28: como %s, todas las rutas responden 403 y no escriben',
      async (role) => {
        for (const [route, call] of everyRoute()) {
          const response = await call(routesOf(world.internals[role]));
          expect({ route, status: response.status, code: response.body.code }).toEqual({
            route,
            status: 403,
            code: 'SHARED_FORBIDDEN',
          });
        }
        expect(await rowsOf(world.internals[role])).toEqual([]);
        expect(await rowsOf(a)).toEqual(rowsBefore);
      },
    );

    it('CA-28: sin token, todas las rutas responden 401', async () => {
      for (const [route, call] of everyRoute()) {
        const response = await call(routesOf());
        expect({ route, status: response.status, code: response.body.code }).toEqual({
          route,
          status: 401,
          code: 'SHARED_UNAUTHENTICATED',
        });
      }
      expect(await rowsOf(a)).toEqual(rowsBefore);
    });
  });
});
