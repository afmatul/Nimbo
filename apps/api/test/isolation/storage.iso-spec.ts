import { randomUUID } from 'node:crypto';

import { folderContentsResponseSchema } from '@nimbo/contracts';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { accessibleNodes } from '../../src/modules/access';
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
import { requiredEnv } from '../support/database-urls';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount, WorldFile, WorldUpload } from './setup/isolation-world';

/** Los dos clientes tienen archivos con los mismos nombres y tamaños (003 CA-10). */
const SHARED_NAMES = ['Informe anual.txt', 'Notas.txt'];
const VALID_INIT = { name: 'nuevo.txt', sizeBytes: 10 };

/**
 * Aislamiento de `storage` como `nimbo_app` (CA-16, CA-17; cierra 003 CA-10, CA-11 y CA-14 con archivos reales): lo
 * ajeno responde igual que lo inexistente, cada cliente solo ve lo suyo, RLS niega filas aunque la consulta olvide
 * filtrar, y los roles internos no llegan a ninguna ruta de carga o descarga.
 */
describe('aislamiento de cargas y archivos (CA-16, CA-17)', () => {
  let world: IsolationWorld;
  let storage: StorageHttpApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let filesA: WorldFile[];
  let filesB: WorldFile[];
  let uploadA: WorldUpload;

  const routesOf = (account: WorldAccount): StorageClient =>
    storage.clientFor(account.id, world.tokenFor(account));

  beforeAll(async () => {
    world = await createIsolationWorld();
    storage = await createStorageHttpApp(world.appComposition());
    [a, b] = world.clients;
    filesA = await world.withFiles(storage.testApp, a, SHARED_NAMES);
    filesB = await world.withFiles(storage.testApp, b, SHARED_NAMES);
    [uploadA] = (await world.withUploads(storage.testApp, a, 1)) as [WorldUpload];
    await world.withUploads(storage.testApp, b, 1);
  });

  afterAll(async () => {
    await storage?.close();
    await world?.close();
  });

  describe('lo ajeno responde como inexistente (CA-16, 003 CA-11)', () => {
    it.each([
      ['completar', (client: StorageClient, id: string) => client.complete(id)],
      ['reanudar (pedir URLs de partes)', (client: StorageClient, id: string) => client.resume(id)],
      ['cancelar', (client: StorageClient, id: string) => client.cancel(id)],
    ])(
      'CA-16: %s una carga de A como B es el mismo 404 que un id inexistente',
      async (_action, call) => {
        const asB = routesOf(b);

        const foreign = await call(asB, uploadA.id);
        const missing = await call(asB, randomUUID());

        expect(foreign.status).toBe(404);
        expect(foreign.body).toMatchObject({ code: 'STORAGE_UPLOAD_NOT_FOUND' });
        expect(comparable(foreign)).toEqual(comparable(missing));
        expect(foreign.body.correlationId).not.toBe(missing.body.correlationId);
      },
    );

    it('CA-16: tras los intentos de B la carga de A sigue activa y A puede reanudarla', async () => {
      const [row] = (await storage.owner.query('SELECT estado FROM carga WHERE id = $1', [
        uploadA.id,
      ])) as { estado: string }[];

      expect(row?.estado).toBe('activa');
      expect((await routesOf(a).resume(uploadA.id)).status).toBe(200);
    });

    it('CA-16: pedir la descarga de un archivo de A como B es el mismo 404 que un id inexistente', async () => {
      const asB = routesOf(b);
      const target = filesA[0]?.id ?? '';

      const foreign = await asB.downloadUrl(target);
      const missing = await asB.downloadUrl(randomUUID());

      expect(foreign.status).toBe(404);
      expect(foreign.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
      expect(comparable(foreign)).toEqual(comparable(missing));
      expect((await routesOf(a).downloadUrl(target)).status).toBe(200);
    });
  });

  it('003 CA-10: con archivos de igual nombre y tamaño, cada cliente lista solo los suyos', async () => {
    const listed = async (account: WorldAccount): Promise<string[]> => {
      const response = await routesOf(account).folderContents();
      expect(response.status).toBe(200);
      return folderContentsResponseSchema
        .parse(response.body)
        .items.filter((item) => item.type === 'file')
        .map((item) => item.id)
        .sort();
    };

    expect(await listed(a)).toEqual(filesA.map((file) => file.id).sort());
    expect(await listed(b)).toEqual(filesB.map((file) => file.id).sort());
  });

  describe('RLS como segunda barrera (003 CA-14)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;

    const worldFileIds = (): string[] => [...filesA, ...filesB].map((file) => file.id);
    const worldOwners = (): string[] => [a.id, b.id];

    /** La consulta de archivos **sin** `accessibleNodes` (como si alguien olvidara el filtro). */
    const unfilteredFiles = (actor: Actor): Promise<{ id: string }[]> =>
      context
        .requireActorScope(actor)
        .createQueryBuilder()
        .select('a.id', 'id')
        .from('archivo', 'a')
        .where('a.eliminado_en IS NULL')
        .andWhere('a.id = ANY(:ids)', { ids: worldFileIds() })
        .getRawMany();

    const idsOf = (rows: readonly { id: string }[]): string[] => rows.map((row) => row.id).sort();

    beforeAll(() => {
      runner = storage.testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
      context = storage.testApp.app.get(TransactionContext);
    });

    it('003 CA-14: `nimbo_app` sin actor no ve filas de `archivo`, `version_archivo` ni `carga`', async () => {
      const bare = await new DataSource(
        buildDataSourceOptions({ DATABASE_URL: requiredEnv('DATABASE_URL') }),
      ).initialize();
      try {
        const count = async (sql: string, ids: string[]): Promise<number> => {
          const rows = (await bare.query(sql, [ids])) as { total: number }[];
          return rows[0]?.total ?? -1;
        };

        expect(
          await count(
            'SELECT count(*)::int AS total FROM archivo WHERE id = ANY($1)',
            worldFileIds(),
          ),
        ).toBe(0);
        expect(
          await count(
            'SELECT count(*)::int AS total FROM version_archivo WHERE archivo_id = ANY($1)',
            worldFileIds(),
          ),
        ).toBe(0);
        expect(
          await count(
            'SELECT count(*)::int AS total FROM carga WHERE propietario_id = ANY($1)',
            worldOwners(),
          ),
        ).toBe(0);
      } finally {
        await bare.destroy();
      }
    });

    it('003 CA-14: con el actor de B, quitar `accessibleNodes` de la consulta sigue sin devolver filas de A', async () => {
      const actor = createActor(b.id, Role.CLIENT);

      const [files, versions, uploads] = await runner.withActor(actor, async () => {
        const scope = context.requireActorScope(actor);
        return [
          await unfilteredFiles(actor),
          (await scope.query(
            'SELECT archivo_id AS id FROM version_archivo WHERE archivo_id = ANY($1)',
            [worldFileIds()],
          )) as { id: string }[],
          (await scope.query(
            'SELECT propietario_id AS id FROM carga WHERE propietario_id = ANY($1)',
            [worldOwners()],
          )) as { id: string }[],
        ];
      });

      expect(idsOf(files)).toEqual(filesB.map((file) => file.id).sort());
      expect(idsOf(versions)).toEqual(filesB.map((file) => file.id).sort());
      expect(uploads.map((row) => row.id)).toEqual([b.id]);
    });

    it.each(INTERNAL_ROLES)(
      '003 CA-10: como %s, `accessibleNodes` da 0 archivos aunque el dueño sí vea los suyos',
      async (role) => {
        const internal = createActor(world.internals[role].id, role);
        const owner = createActor(a.id, Role.CLIENT);
        const accessible = (actor: Actor) => {
          const fragment = accessibleNodes(actor);
          return context
            .requireActorScope(actor)
            .createQueryBuilder()
            .select('a.id', 'id')
            .from('archivo', 'a')
            .where('a.id = ANY(:ids)', { ids: worldFileIds() })
            .andWhere(`a.id IN (SELECT nodo_id FROM (${fragment.sql}) accesibles)`, {
              ...fragment.parameters,
            })
            .getRawMany<{ id: string }>();
        };

        const internalRows = await runner.withActor(internal, () => accessible(internal));
        const ownerRows = await runner.withActor(owner, () => accessible(owner));

        expect(internalRows).toEqual([]);
        expect(idsOf(ownerRows)).toEqual(filesA.map((file) => file.id).sort());
      },
    );
  });

  describe('roles internos y sin sesión (CA-17)', () => {
    /** Cada ruta como función: `supertest` abre un servidor por petición y se envían de a una. */
    const everyRoute = (
      client: StorageClient,
      uploadId: string,
      fileId: string,
    ): [string, () => Promise<Response>][] => [
      ['POST /uploads', () => client.init(VALID_INIT)],
      ['POST /uploads/:id/resume', () => client.resume(uploadId)],
      ['POST /uploads/:id/complete', () => client.complete(uploadId)],
      ['DELETE /uploads/:id', () => client.cancel(uploadId)],
      ['GET /folders/contents', () => client.folderContents()],
      ['POST /files/:id/download-url', () => client.downloadUrl(fileId)],
    ];

    it.each(INTERNAL_ROLES)('CA-17: como %s, todas las rutas responden 403', async (role) => {
      const internal = world.internals[role];
      const routes = everyRoute(routesOf(internal), uploadA.id, filesA[0]?.id ?? '');

      for (const [route, send] of routes) {
        const response = await send();
        expect({ route, status: response.status, code: response.body.code }).toEqual({
          route,
          status: 403,
          code: 'SHARED_FORBIDDEN',
        });
      }
      const [row] = (await storage.owner.query('SELECT estado FROM carga WHERE id = $1', [
        uploadA.id,
      ])) as { estado: string }[];
      expect(row?.estado).toBe('activa');
    });

    it('CA-17: sin token, todas las rutas responden 401', async () => {
      const anonymous = storage.clientFor(a.id);

      for (const [route, send] of everyRoute(anonymous, uploadA.id, filesA[0]?.id ?? '')) {
        const response = await send();
        expect({ route, status: response.status, code: response.body.code }).toEqual({
          route,
          status: 401,
          code: 'SHARED_UNAUTHENTICATED',
        });
      }
    });
  });
});
