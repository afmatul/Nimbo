import { searchResponseSchema } from '@nimbo/contracts';
import type { SearchResponse } from '@nimbo/contracts';

import { I_NODE_SEARCH_REPOSITORY } from '../../src/modules/storage/search/application/ports/i-node-search.repository.port';
import type { INodeSearchRepository } from '../../src/modules/storage/search/application/ports/i-node-search.repository.port';
import { createActor, I_TRANSACTION_RUNNER, Role } from '../../src/shared';
import type { ITransactionRunner } from '../../src/shared';
import { insertShare } from '../int/sharing/sharing-test-db';
import { createStorageHttpApp, insertCommittedFile } from '../int/storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../int/storage/storage-http';
import { insertFileWithVersion, insertFolder } from '../int/storage/storage-test-db';
import type { FolderRow } from '../int/storage/storage-test-db';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

/** Los dos clientes tienen carpetas y archivos con los mismos nombres o casi (003 CA-10). */
const SHARED_FOLDERS = ['Informes', 'Facturas'];
const SHARED_FILES = ['Informe anual.txt', 'Acta del informe.txt'];
/** Lo único que distingue los nombres de A y B: un dígito. */
const NEARLY = { a: 'Informe trimestral 2026.txt', b: 'Informe trimestral 2025.txt' };
/** Carpeta de A que contiene un archivo de B (insertado a mano) y un archivo de A compartido con B (012): B no debe verla nombrada. */
const FOREIGN_FOLDER_NAME = 'Informes privados de A';
const SHARED_WITH_B_NAME = 'Plan reservado.txt';
const PAGE_LIMIT = '1';

/** Nodos de un cliente que coinciden con «informe», con la carpeta que contiene a los anidados. */
interface ClientNodes {
  readonly ids: readonly string[];
  readonly folderIds: readonly string[];
}

const idsOf = (body: SearchResponse): string[] => body.items.map((item) => item.id);

/**
 * Aislamiento de la búsqueda como `nimbo_app` (spec 018 CA-13, CA-14; RNF-05): con nombres casi idénticos, B solo
 * recibe nodos propios, en cualquier página y con cualquier cursor; la ubicación nunca nombra una carpeta que B no ve;
 * un texto que solo coincide con A responde igual que uno que no coincide con nada; los roles internos no llegan a la
 * ruta y, en el repositorio, reciben 0 filas.
 */
describe('aislamiento de la búsqueda (018 CA-13, CA-14)', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let clientA: StorageClient;
  let clientB: StorageClient;
  let nodesA: ClientNodes;
  let nodesB: ClientNodes;
  let foreignFolder: FolderRow;
  let fileOfBInForeignFolder: string;

  const clientOf = (account: WorldAccount): StorageClient =>
    storage.clientFor(account.id, world.tokenFor(account));

  const fileRow = async (owner: WorldAccount, name: string, folderId: string | null) =>
    (
      await storage.owner.transaction((manager) =>
        insertFileWithVersion(manager, owner.id, { name, folderId }),
      )
    ).fileId;

  /** Raíz con los nombres compartidos, una carpeta anidada con su archivo y el nombre casi igual. */
  const seed = async (account: WorldAccount, nearlyName: string): Promise<ClientNodes> => {
    const folders = await world.withFolders(storage.testApp, account, SHARED_FOLDERS);
    const files = await world.withFiles(storage.testApp, account, SHARED_FILES);
    const box = await insertFolder(storage.owner, account.id, { name: 'Informes anidados' });
    const nested = await fileRow(account, 'Informe anidado.txt', box.id);
    const nearly = await fileRow(account, nearlyName, null);
    const informes = folders.filter((folder) => folder.name === 'Informes');
    return {
      ids: [...informes, ...files].map((node) => node.id).concat(box.id, nested, nearly),
      folderIds: [...folders.map((folder) => folder.id), box.id],
    };
  };

  const searchAs = async (
    client: StorageClient,
    query: Record<string, string>,
  ): Promise<SearchResponse> => {
    const response = await client.search(query);
    expect(response.status).toBe(200);
    return searchResponseSchema.parse(response.body);
  };

  /** Ids de todas las páginas de `limit` 1, siguiendo `nextCursor` (desde `cursor`, si se da). */
  const allPages = async (client: StorageClient, q: string, cursor?: string): Promise<string[]> => {
    const ids: string[] = [];
    let next: string | null = cursor ?? null;
    do {
      const query = { q, limit: PAGE_LIMIT, ...(next === null ? {} : { cursor: next }) };
      const page = await searchAs(client, query);
      ids.push(...idsOf(page));
      next = page.nextCursor;
    } while (next !== null);
    return ids;
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp(world.appComposition());
    [a, b] = world.clients;
    [clientA, clientB] = [clientOf(a), clientOf(b)];
    nodesA = await seed(a, NEARLY.a);
    nodesB = await seed(b, NEARLY.b);
    foreignFolder = await insertFolder(storage.owner, a.id, { name: FOREIGN_FOLDER_NAME });
    fileOfBInForeignFolder = await fileRow(b, 'Informe en carpeta ajena.txt', foreignFolder.id);
  });

  afterAll(async () => {
    await storage?.close();
    await world?.close();
  });

  describe('resultados y ubicación (CA-13)', () => {
    it('CA-13: con los mismos nombres, B recibe solo sus nodos y A solo los suyos', async () => {
      const ofB = idsOf(await searchAs(clientB, { q: 'informe' }));
      const ofA = idsOf(await searchAs(clientA, { q: 'informe' }));

      expect([...ofB].sort()).toEqual([...nodesB.ids, fileOfBInForeignFolder].sort());
      expect([...ofA].sort()).toEqual([...nodesA.ids, foreignFolder.id].sort());
    });

    it('CA-13: la ubicación solo nombra carpetas de B; la carpeta de A que contiene un archivo de B queda `null`', async () => {
      const body = await searchAs(clientB, { q: 'informe' });
      const locations = body.items.flatMap((item) =>
        item.location === null ? [] : [item.location],
      );
      const foreignHit = body.items.find((item) => item.id === fileOfBInForeignFolder);

      expect(locations.length).toBeGreaterThan(0);
      for (const location of locations) expect(nodesB.folderIds).toContain(location.id);
      expect(foreignHit?.location).toBeNull();
      expect(JSON.stringify(body)).not.toContain(FOREIGN_FOLDER_NAME);
      expect(foreignHit).toMatchObject({ folderId: null, shared: false });
      expect(JSON.stringify(body)).not.toContain(foreignFolder.id);
    });

    it('CA-2, CA-13: un archivo que A comparte con B aparece `shared`, sin ubicación ni el id de la carpeta de A', async () => {
      const { fileId } = await insertCommittedFile(storage.owner, a.id, {
        folderId: foreignFolder.id,
        name: SHARED_WITH_B_NAME,
      });
      await insertShare(storage.owner, { ownerId: a.id, granteeId: b.id, node: { fileId } });

      const ofB = await searchAs(clientB, { q: 'reservado' });
      const ofA = await searchAs(clientA, { q: 'reservado' });

      expect(ofB.items).toHaveLength(1);
      expect(ofB.items[0]).toMatchObject({
        id: fileId,
        folderId: null,
        location: null,
        shared: true,
      });
      expect(JSON.stringify(ofB)).not.toContain(foreignFolder.id);
      expect(JSON.stringify(ofB)).not.toContain(FOREIGN_FOLDER_NAME);
      expect(ofA.items[0]).toMatchObject({
        id: fileId,
        shared: false,
        location: { id: foreignFolder.id },
      });
    });

    it('CA-13: un texto que solo coincide con A responde igual que uno que no coincide con nada', async () => {
      const onlyA = await clientB.search({ q: '2026' });
      const nothing = await clientB.search({ q: 'zz-sin-coincidencias' });

      expect(searchResponseSchema.parse(onlyA.body)).toEqual({ items: [], nextCursor: null });
      expect(comparable(onlyA)).toEqual(comparable(nothing));
    });

    it('CA-13: con filtros de tipo y fecha, B sigue viendo solo lo suyo', async () => {
      const filtered = await searchAs(clientB, {
        q: 'informe',
        type: 'documents',
        from: '2000-01-01T00:00:00.000Z',
      });

      expect(idsOf(filtered).length).toBeGreaterThan(0);
      for (const id of idsOf(filtered))
        expect([...nodesB.ids, fileOfBInForeignFolder]).toContain(id);
    });
  });

  describe('cursor (CA-13)', () => {
    it('CA-13: B recorre todas sus páginas sin ver nodos de A', async () => {
      const ids = await allPages(clientB, 'informe');

      expect(ids).toHaveLength(new Set(ids).size);
      expect([...ids].sort()).toEqual([...nodesB.ids, fileOfBInForeignFolder].sort());
    });

    it('CA-13: con un cursor emitido para A, B sigue viendo solo lo suyo', async () => {
      const pageA = await searchAs(clientA, { q: 'informe', limit: PAGE_LIMIT });
      if (pageA.nextCursor === null) throw new Error('A debería tener más de una página');

      const ids = await allPages(clientB, 'informe', pageA.nextCursor);

      for (const id of ids) expect([...nodesB.ids, fileOfBInForeignFolder]).toContain(id);
    });
  });

  describe('roles internos y sin sesión (CA-14)', () => {
    it.each(INTERNAL_ROLES)('CA-14: como %s, `GET /search` responde 403', async (role) => {
      const response = await clientOf(world.internals[role]).search({ q: 'informe' });

      expect({ status: response.status, code: response.body.code }).toEqual({
        status: 403,
        code: 'SHARED_FORBIDDEN',
      });
    });

    it('CA-14: sin token, `GET /search` responde 401', async () => {
      const response = await storage.clientFor(a.id).search({ q: 'informe' });

      expect({ status: response.status, code: response.body.code }).toEqual({
        status: 401,
        code: 'SHARED_UNAUTHENTICATED',
      });
    });

    it.each(INTERNAL_ROLES)(
      'CA-13: como %s, el repositorio de la búsqueda da 0 filas (A sí ve las suyas)',
      async (role) => {
        const runner = storage.testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
        const repository = storage.testApp.app.get<INodeSearchRepository>(I_NODE_SEARCH_REPOSITORY);
        const searchAsActor = (id: string, actorRole: Role) => {
          const actor = createActor(id, actorRole);
          return runner.withActor(actor, () =>
            repository.search(actor, { terms: ['informe'], limit: 100 }),
          );
        };

        expect(await searchAsActor(world.internals[role].id, role)).toEqual({
          hits: [],
          nextCursor: null,
        });
        expect((await searchAsActor(a.id, Role.CLIENT)).hits.length).toBeGreaterThan(0);
      },
    );
  });
});
