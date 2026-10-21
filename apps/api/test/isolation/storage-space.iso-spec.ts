import { randomUUID } from 'node:crypto';

import {
  folderContentsResponseSchema,
  NODE_SORTS,
  SORT_DIRECTIONS,
  spaceSummaryResponseSchema,
} from '@nimbo/contracts';
import type { NodeSort, SortDirection, SpaceSummaryResponse } from '@nimbo/contracts';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { SpaceMeasurer } from '../../src/modules/storage/application/space-measurer';
import type { StorageLogger } from '../../src/modules/storage/application/storage-logger';
import { UsageReconciler } from '../../src/modules/storage/application/usage-reconciler';
import { SqlClientAccountScanner } from '../../src/modules/storage/infrastructure/persistence/sql-client-account.scanner';
import { TypeOrmQuotaRepository } from '../../src/modules/storage/infrastructure/persistence/typeorm-quota.repository';
import { TypeOrmSpaceRepository } from '../../src/modules/storage/infrastructure/persistence/typeorm-space.repository';
import { TypeOrmTrashRepository } from '../../src/modules/storage/infrastructure/persistence/typeorm-trash.repository';
import { createActor, Role } from '../../src/shared';
import type { Actor } from '../../src/shared';
import { TransactionContext } from '../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { createStorageHttpApp, usedBytesOf } from '../int/storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../int/storage/storage-http';
import { insertAccount, insertFileWithVersion } from '../int/storage/storage-test-db';
import { connectTo } from '../support/database-urls';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type {
  IsolationWorld,
  WorldAccount,
  WorldFile,
  WorldFolder,
  WorldTrash,
} from './setup/isolation-world';
import { startRestrictedOwnerDatabase } from './setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from './setup/nosuperuser-postgres';

/** Los dos clientes tienen carpetas, archivos y papelera con los mismos nombres (003 CA-10). */
const FOLDER_NAMES = ['Proyectos', 'Facturas'];
const FILE_NAMES = ['Informe anual.txt', 'Acta.txt', 'Notas.txt'];
const TRASH_REQUEST = { files: ['Borrador.txt'], folders: ['Viejos'] };
/** Página mínima: obliga a seguir el cursor por el límite carpeta/archivo en cada orden. */
const PAGE_LIMIT = '1';
const ORDERS: readonly [NodeSort, SortDirection][] = NODE_SORTS.flatMap((sort) =>
  SORT_DIRECTIONS.map((dir): [NodeSort, SortDirection] => [sort, dir]),
);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Nodos vivos de un cliente del mundo. */
interface ClientNodes {
  readonly folders: readonly WorldFolder[];
  readonly files: readonly WorldFile[];
  readonly trash: WorldTrash;
}

const first = <T>(items: readonly T[]): T => {
  const [item] = items;
  if (item === undefined) throw new Error('El mundo no tiene el nodo que la prueba necesita');
  return item;
};

const liveIdsOf = (nodes: ClientNodes): string[] =>
  [...nodes.folders, ...nodes.files].map((node) => node.id).sort();

const summaryOf = async (client: StorageClient): Promise<SpaceSummaryResponse> =>
  spaceSummaryResponseSchema.parse((await client.spaceSummary()).body);

/** Ids de la raíz en el orden pedido, siguiendo `nextCursor` página a página (desde `cursor`, si se da). */
const listAllPages = async (
  client: StorageClient,
  order: Record<string, string>,
  cursor?: string,
): Promise<string[]> => {
  const ids: string[] = [];
  let next: string | null = cursor ?? null;
  do {
    const query = { ...order, limit: PAGE_LIMIT, ...(next === null ? {} : { cursor: next }) };
    const page = folderContentsResponseSchema.parse((await client.folderContents(query)).body);
    ids.push(...page.items.map((item) => item.id));
    next = page.nextCursor;
  } while (next !== null);
  return ids;
};

/**
 * Aislamiento del resumen de espacio y del listado ordenado como `nimbo_app` (spec 007 CA-16, CA-17; RNF-05): B solo
 * recibe cifras y nodos propios, una carpeta de A responde como una inexistente aunque pida un orden, y los roles
 * internos y las peticiones sin sesión no llegan a ninguna de las dos rutas.
 */
describe('aislamiento del resumen de espacio y del listado ordenado (CA-16, CA-17)', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let clientA: StorageClient;
  let clientB: StorageClient;
  let nodesA: ClientNodes;
  let nodesB: ClientNodes;

  const seed = async (account: WorldAccount): Promise<ClientNodes> => ({
    folders: await world.withFolders(storage.testApp, account, FOLDER_NAMES),
    files: await world.withFiles(storage.testApp, account, FILE_NAMES),
    trash: await world.withTrash(storage.testApp, account, TRASH_REQUEST),
  });

  const clientOf = (account: WorldAccount): StorageClient =>
    storage.clientFor(account.id, world.tokenFor(account));

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp(world.appComposition());
    [a, b] = world.clients;
    [clientA, clientB] = [clientOf(a), clientOf(b)];
    nodesA = await seed(a);
    nodesB = await seed(b);
  });

  afterAll(async () => {
    await storage?.close();
    await world?.close();
  });

  describe('resumen de espacio (CA-16)', () => {
    it('CA-16: con los mismos nodos, A y B reciben el mismo resumen', async () => {
      const [summaryA, summaryB] = [await summaryOf(clientA), await summaryOf(clientB)];

      expect(summaryB.usedBytes).toBeGreaterThan(0);
      expect(summaryB.breakdown.trashBytes).toBeGreaterThan(0);
      expect(summaryA).toEqual(summaryB);
    });

    it('CA-16: lo que A suma a sus archivos y a su papelera no cambia el resumen de B', async () => {
      const before = await summaryOf(clientB);
      const beforeA = await summaryOf(clientA);

      await world.withFiles(storage.testApp, a, ['Extra.txt']);
      await world.withTrash(storage.testApp, a, { files: ['Extra borrado.txt'] });

      expect(await summaryOf(clientB)).toEqual(before);
      const afterA = await summaryOf(clientA);
      expect(afterA.usedBytes).toBeGreaterThan(beforeA.usedBytes);
      expect(afterA.breakdown.trashBytes).toBeGreaterThan(beforeA.breakdown.trashBytes);
    });
  });

  describe('listado ordenado (CA-16)', () => {
    it.each(ORDERS)(
      'CA-16: B lista su raíz por %s %s, página a página, sin ver nodos de A',
      async (sort, dir) => {
        const ids = await listAllPages(clientB, { sort, dir });

        expect(ids).toHaveLength(new Set(ids).size);
        expect([...ids].sort()).toEqual(liveIdsOf(nodesB));
      },
    );

    it.each(ORDERS)(
      'CA-16: con un cursor emitido para A (%s %s), B sigue viendo solo lo suyo',
      async (sort, dir) => {
        const pageA = folderContentsResponseSchema.parse(
          (await clientA.folderContents({ sort, dir, limit: PAGE_LIMIT })).body,
        );
        if (pageA.nextCursor === null) throw new Error('A debería tener más de una página');

        const ids = await listAllPages(clientB, { sort, dir }, pageA.nextCursor);

        expect(liveIdsOf(nodesB)).toEqual(expect.arrayContaining(ids));
      },
    );

    it.each(ORDERS)(
      'CA-16: una carpeta de A pedida por B con %s %s es el mismo 404 que una inexistente',
      async (sort, dir) => {
        const foreign = await clientB.folderContents({
          folderId: first(nodesA.folders).id,
          sort,
          dir,
        });
        const missing = await clientB.folderContents({ folderId: randomUUID(), sort, dir });

        expect({ status: foreign.status, code: foreign.body.code }).toEqual({
          status: 404,
          code: 'STORAGE_NODE_NOT_FOUND',
        });
        expect(comparable(foreign)).toEqual(comparable(missing));
      },
    );
  });

  describe('roles internos y sin sesión (CA-17)', () => {
    const routesOf = (client: StorageClient): [string, () => Promise<Response>][] => [
      ['GET /storage/summary', () => client.spaceSummary()],
      ['GET /folders/contents?sort', () => client.folderContents({ sort: 'size', dir: 'desc' })],
      [
        'GET /folders/contents?folderId&sort',
        () => client.folderContents({ folderId: first(nodesA.folders).id, sort: 'name' }),
      ],
    ];

    it.each(INTERNAL_ROLES)(
      'CA-17: como %s, el resumen y el listado responden 403',
      async (role) => {
        for (const [route, call] of routesOf(clientOf(world.internals[role]))) {
          const response = await call();
          expect({ route, status: response.status, code: response.body.code }).toEqual({
            route,
            status: 403,
            code: 'SHARED_FORBIDDEN',
          });
        }
      },
    );

    it('CA-17: sin token, el resumen y el listado responden 401', async () => {
      for (const [route, call] of routesOf(storage.clientFor(a.id))) {
        const response = await call();
        expect({ route, status: response.status, code: response.body.code }).toEqual({
          route,
          status: 401,
          code: 'SHARED_UNAUTHENTICATED',
        });
      }
    });
  });
});

const ANA_BYTES = [1000n, 2500n];
const BRUNO_BYTES = [7000n, 9000n, 11000n];
const sum = (values: readonly bigint[]): bigint =>
  values.reduce((total, value) => total + value, 0n);

/** `SpaceMeasurer` y `UsageReconciler` sobre una conexión `nimbo_app`, como los arma el `worker`. */
const reconcilerOn = (context: TransactionContext, transactions: TypeOrmTransactionRunner) => {
  const measurer = new SpaceMeasurer(
    new TypeOrmSpaceRepository(context),
    new TypeOrmTrashRepository(context),
  );
  const logger: jest.Mocked<StorageLogger> = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const reconciler = new UsageReconciler(
    transactions,
    new TypeOrmQuotaRepository(context),
    measurer,
    logger,
  );
  return { measurer, reconciler, logger };
};

/**
 * Conciliación sin actor bajo RLS (spec 007 CA-16; plan §5, D-12) con un dueño `NOSUPERUSER` (ADR-0021): lo único
 * que se lee sin actor son los UUID de las cuentas de cliente; medir y corregir se hace como cada dueño, como
 * `nimbo_app` sin `BYPASSRLS`, y nunca suma bytes de otra cuenta.
 */
describe('conciliación de espacio bajo RLS (CA-16, plan D-12)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let context: TransactionContext;
  let transactions: TypeOrmTransactionRunner;
  let ana: Actor;
  let bruno: Actor;
  let admin: string;

  const insertFilesAs = (actor: Actor, sizes: readonly bigint[]): Promise<void> =>
    transactions.withActor(actor, async () => {
      for (const sizeBytes of sizes) {
        await insertFileWithVersion(context.requireActorScope(actor), actor.id, { sizeBytes });
      }
    });

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    ana = createActor(await insertAccount(owner), Role.CLIENT);
    bruno = createActor(await insertAccount(owner), Role.CLIENT);
    admin = await insertAccount(owner, Role.ADMIN);
    await insertFilesAs(ana, ANA_BYTES);
    await insertFilesAs(bruno, BRUNO_BYTES);
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('D-12: el escáner sin actor devuelve solo los UUID de las cuentas de cliente', async () => {
    const scanner = new SqlClientAccountScanner(context);

    const ids = await transactions.run(() => scanner.listClientIds(null, 10));

    expect(ids).toEqual([ana.id, bruno.id].sort());
    expect(ids).not.toContain(admin);
    for (const id of ids) expect(id).toMatch(UUID_PATTERN);
  });

  it('D-12: sin actor, la conexión del escáner ve 0 archivos y 0 versiones', async () => {
    const [row] = await transactions.run(
      async () =>
        (await context.manager().query(
          `SELECT (SELECT count(*)::int FROM archivo) AS archivos,
                  (SELECT count(*)::int FROM version_archivo) AS versiones`,
        )) as { archivos: number; versiones: number }[],
    );

    expect(row).toEqual({ archivos: 0, versiones: 0 });
  });

  it('CA-16: la conexión que mide es `nimbo_app`, sin superusuario ni BYPASSRLS', async () => {
    const [row] = (await app.query(
      'SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    )) as Record<string, unknown>[];

    expect(row).toEqual({ role: 'nimbo_app', rolsuper: false, rolbypassrls: false });
  });

  it('CA-16: medir como Ana suma solo sus archivos, no los de Bruno', async () => {
    const { measurer } = reconcilerOn(context, transactions);

    const breakdown = await transactions.withActor(ana, () => measurer.measure(ana));

    expect(breakdown.totalBytes).toBe(sum(ANA_BYTES));
  });

  it('CA-16: conciliar a Ana corrige solo su contador y la bitácora lleva solo UUID y diferencia', async () => {
    const { reconciler, logger } = reconcilerOn(context, transactions);

    await reconciler.reconcile(ana);

    expect(await usedBytesOf(owner, ana.id)).toBe(sum(ANA_BYTES));
    expect(await usedBytesOf(owner, bruno.id)).toBe(0n);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'quota.reconciled',
      userId: ana.id,
      diffBytes: Number(sum(ANA_BYTES)),
    });
  });
});
