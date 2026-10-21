import { randomUUID } from 'node:crypto';

import { fileVersionsResponseSchema } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { createStorageHttpApp, textBytes } from '../int/storage/storage-http';
import type { StorageClient, StorageHttpApp } from '../int/storage/storage-http';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount, WorldFile, WorldFolder } from './setup/isolation-world';

/** A y B tienen un archivo con este nombre: el de A en una carpeta suya, con dos versiones. */
const NAME = 'Contrato.txt';
/** Solo existe en la raíz de A: B lo «reemplaza» en la suya. */
const ONLY_A_NAME = 'Solo de A.txt';
const CONTENT_BYTES = 2048;

type VersionCall = (client: StorageClient, fileId: string, versionId: string) => Promise<Response>;

/** Las tres rutas de versiones (plan 014 §4), cada una como función: `supertest` envía de a una. */
const VERSION_ROUTES: readonly [string, VersionCall][] = [
  ['listar el historial', (client, fileId) => client.fileVersions(fileId)],
  ['pedir la URL de descarga de una versión', (client, f, v) => client.versionDownloadUrl(f, v)],
  ['restaurar una versión', (client, f, v) => client.restoreVersion(f, v)],
];

/** Un archivo del mundo con sus versiones por número (la primera, la más antigua). */
interface VersionedFile {
  readonly id: string;
  readonly versionIds: readonly string[];
}

const firstVersionOf = (file: VersionedFile): string => file.versionIds[0] ?? '';

/**
 * Aislamiento y roles de las rutas de versiones (014 CA-16, CA-17, CA-18; RNF-05) como `nimbo_app`, con MinIO real:
 * lo ajeno responde igual que lo inexistente, el archivo en la papelera no expone su historial, una versión de A no se
 * alcanza a través de un archivo de B, y ningún rol interno llega a las rutas ni a las filas de `version_archivo`.
 */
describe('aislamiento de las versiones (014 CA-16, CA-17, CA-18)', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let folderIdA: string;
  let fileA: VersionedFile;
  let onlyA: VersionedFile;
  let trashedA: VersionedFile;
  let fileB: VersionedFile;

  const routesOf = (account: WorldAccount): StorageClient =>
    storage.clientFor(account.id, world.tokenFor(account));

  const versionIdsOf = async (fileId: string): Promise<string[]> => {
    const rows = await storage.owner.query<{ id: string }[]>(
      'SELECT id FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [fileId],
    );
    return rows.map((row) => row.id);
  };

  /** El único archivo que sembró un `with…` del mundo, con sus versiones. */
  const versioned = async (...[file]: readonly Pick<WorldFile, 'id'>[]): Promise<VersionedFile> => {
    if (file === undefined) throw new Error('El mundo no sembró el archivo');
    return { id: file.id, versionIds: await versionIdsOf(file.id) };
  };

  /** Sube `NAME` a la carpeta de A y lo reemplaza: el archivo queda con las versiones 1 y 2. */
  const uploadTwoVersionsAsA = async (): Promise<VersionedFile> => {
    const asA = routesOf(a);
    const first = await asA.upload(NAME, textBytes(CONTENT_BYTES, 'v1'), 'ask', folderIdA);
    const second = await asA.upload(NAME, textBytes(CONTENT_BYTES, 'v2'), 'replace', folderIdA);
    expect([first.status, second.status]).toEqual([200, 200]);
    return versioned((first.body as { file: { id: string } }).file);
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp(world.appComposition());
    [a, b] = world.clients;
    [{ id: folderIdA }] = (await world.withFolders(storage.testApp, a, ['Contratos'])) as [
      WorldFolder,
    ];
    fileA = await uploadTwoVersionsAsA();
    onlyA = await versioned(...(await world.withFiles(storage.testApp, a, [ONLY_A_NAME])));
    const trash = await world.withTrash(storage.testApp, a, { files: ['En la papelera.txt'] });
    trashedA = await versioned(...trash.files);
    fileB = await versioned(...(await world.withFiles(storage.testApp, b, [NAME])));
  });

  afterAll(async () => {
    await storage?.close();
    await world?.close();
  });

  describe('lo ajeno responde como inexistente (CA-17)', () => {
    it.each(VERSION_ROUTES)(
      'ISO-1 (CA-17): B no puede %s de un archivo de A: mismo 404 que un id inexistente',
      async (_action, call) => {
        const asB = routesOf(b);

        const foreign = await call(asB, fileA.id, firstVersionOf(fileA));
        const missing = await call(asB, randomUUID(), randomUUID());

        expect(foreign.status).toBe(404);
        expect(foreign.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
        expect(comparable(foreign)).toEqual(comparable(missing));
        expect(foreign.body.correlationId).not.toBe(missing.body.correlationId);
      },
    );

    it.each(VERSION_ROUTES.slice(1))(
      'ISO-2 (CA-17): B no puede %s de A a través de un archivo propio: mismo 404 que una versión inexistente',
      async (_action, call) => {
        const asB = routesOf(b);

        const foreign = await call(asB, fileB.id, firstVersionOf(fileA));
        const missing = await call(asB, fileB.id, randomUUID());

        expect(foreign.status).toBe(404);
        expect(foreign.body).toMatchObject({ code: 'STORAGE_VERSION_NOT_FOUND' });
        expect(comparable(foreign)).toEqual(comparable(missing));
      },
    );

    it('ISO-3 (CA-17): B no puede reemplazar un archivo de A en una carpeta de A: mismo 404 que una carpeta inexistente', async () => {
      const asB = routesOf(b);
      const replaceIn = (folderId: string) =>
        asB.init({ name: NAME, sizeBytes: CONTENT_BYTES, onConflict: 'replace', folderId });

      const foreign = await replaceIn(folderIdA);
      const missing = await replaceIn(randomUUID());

      expect(foreign.status).toBe(404);
      expect(foreign.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
      expect(comparable(foreign)).toEqual(comparable(missing));
    });

    it('ISO-4 (CA-17): B no puede reemplazar por nombre un archivo de A: `replace` en su raíz crea un archivo propio', async () => {
      const response = await routesOf(b).upload(ONLY_A_NAME, textBytes(CONTENT_BYTES), 'replace');

      expect(response.status).toBe(200);
      const created = (response.body as { file: { id: string } }).file.id;
      expect(created).not.toBe(onlyA.id);
      expect(await versionIdsOf(created)).toHaveLength(1);
      expect(await versionIdsOf(onlyA.id)).toEqual(onlyA.versionIds);
    });

    it('CA-17: tras los intentos de B, los archivos de A conservan sus versiones y A ve su historial', async () => {
      const listed = await routesOf(a).fileVersions(fileA.id);

      expect(listed.status).toBe(200);
      const items = fileVersionsResponseSchema.parse(listed.body).items;
      expect(items.map((item) => item.id).sort()).toEqual([...fileA.versionIds].sort());
      expect(await versionIdsOf(fileA.id)).toEqual(fileA.versionIds);
      expect(await versionIdsOf(fileB.id)).toEqual(fileB.versionIds);
    });
  });

  it.each(VERSION_ROUTES)(
    'ISO-5 (CA-16): A no puede %s de su archivo en la papelera: mismo 404 que un id inexistente',
    async (_action, call) => {
      const asA = routesOf(a);

      const trashed = await call(asA, trashedA.id, firstVersionOf(trashedA));
      const missing = await call(asA, randomUUID(), randomUUID());

      expect(trashed.status).toBe(404);
      expect(trashed.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
      expect(comparable(trashed)).toEqual(comparable(missing));
    },
  );

  describe('roles internos y sin sesión (CA-18)', () => {
    /** Las tres rutas de versiones y el reemplazo, sobre el archivo de A. */
    const everyRoute = (client: StorageClient): [string, () => Promise<Response>][] => [
      ...VERSION_ROUTES.map(([action, call]): [string, () => Promise<Response>] => [
        action,
        () => call(client, fileA.id, firstVersionOf(fileA)),
      ]),
      [
        'reemplazar',
        () => client.init({ name: NAME, sizeBytes: CONTENT_BYTES, onConflict: 'replace' }),
      ],
    ];

    const expectEvery = async (client: StorageClient, status: number, code: string) => {
      for (const [route, send] of everyRoute(client)) {
        const response = await send();
        expect({ route, status: response.status, code: response.body.code }).toEqual({
          route,
          status,
          code,
        });
      }
    };

    it.each(INTERNAL_ROLES)(
      'ISO-6 (CA-18): %s no puede usar ninguna ruta de versiones ni reemplazar: 403',
      async (role) => {
        await expectEvery(routesOf(world.internals[role]), 403, 'SHARED_FORBIDDEN');

        expect(await versionIdsOf(fileA.id)).toEqual(fileA.versionIds);
      },
    );

    it('ISO-7 (CA-18): sin token no se puede usar ninguna ruta de versiones ni reemplazar: 401', async () => {
      await expectEvery(storage.clientFor(a.id), 401, 'SHARED_UNAUTHENTICATED');
    });
  });

  describe('RLS de `version_archivo` (CA-18, RNF-05)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;

    const visibleVersions = (actor: Actor): Promise<{ id: string }[]> =>
      runner.withActor(actor, () =>
        context
          .requireActorScope(actor)
          .query('SELECT id FROM version_archivo WHERE archivo_id = ANY($1)', [
            [fileA.id, onlyA.id, trashedA.id, fileB.id],
          ]),
      );

    beforeAll(() => {
      runner = storage.testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
      context = storage.testApp.app.get(TransactionContext);
    });

    it.each(INTERNAL_ROLES)(
      'ISO-8 (CA-18): %s no ve filas de `version_archivo` aunque A sí vea las suyas',
      async (role) => {
        const internal = createActor(world.internals[role].id, role);
        const owner = createActor(a.id, Role.CLIENT);

        expect(await visibleVersions(internal)).toEqual([]);
        expect(await visibleVersions(owner)).toHaveLength(
          fileA.versionIds.length + onlyA.versionIds.length + trashedA.versionIds.length,
        );
      },
    );
  });
});
