import { randomUUID } from 'node:crypto';

import { previewUrlResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { ContentMatchBindingModule } from '../../src/content-match-binding.module';
import { StorageModule, StoragePreviewFacade } from '../../src/modules/storage';
import { I_NODE_REPOSITORY } from '../../src/modules/storage/application/ports/i-node.repository.port';
import type { INodeRepository } from '../../src/modules/storage/application/ports/i-node.repository.port';
import { PreviewModule } from '../../src/modules/storage/preview';
import { PlanLimitsBindingModule } from '../../src/plan-limits-binding.module';
import {
  buildDataSourceOptions,
  createActor,
  I_TRANSACTION_RUNNER,
  Role,
  TransactionContext,
} from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { ActorScopeMissingError } from '../../src/shared/infrastructure/persistence/actor-scope.errors';
import { buildTestEnv } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner, requiredEnv } from '../support/database-urls';

import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount, WorldFile } from './setup/isolation-world';

const comparable = (response: Response) => {
  const { correlationId: _id, ...body } = response.body as Record<string, unknown>;
  return { status: response.status, contentType: response.headers['content-type'], body };
};

/** Postgres real, JWT de identity y una sola conexión: el flujo preview también atraviesa RLS. */
describe('017 T-04: aislamiento real de preview (CA-3, CA-4, CA-5)', () => {
  let world: IsolationWorld;
  let app: TestApp;
  let database: DataSource;
  let owner: DataSource;
  let a: WorldAccount;
  let b: WorldAccount;
  let fileA: WorldFile;
  let fileB: WorldFile;
  let transactions: ITransactionRunner;
  let context: TransactionContext;

  beforeAll(async () => {
    world = await createIsolationWorld();
    [a, b] = world.clients;
    database = await new DataSource({
      ...buildDataSourceOptions({ DATABASE_URL: requiredEnv('DATABASE_URL') }),
      extra: { max: 1 },
    }).initialize();
    owner = await connectAsOwner();
    const env = buildTestEnv(world.appComposition().env);
    app = await world.appAs({
      modules: [
        PlanLimitsBindingModule,
        ContentMatchBindingModule,
        PreviewModule.register({
          storageModule: StorageModule.forRoot(env),
          config: { previewUrlPerMinute: env.RATE_LIMIT_PREVIEW_URL_PER_MINUTE },
        }),
      ],
      overrides: [{ provide: DataSource, useValue: database }],
    });
    const [first] = await world.withFiles(app, a, ['PRIVADO-preview.txt']);
    const [second] = await world.withFiles(app, b, ['PRIVADO-preview.txt']);
    if (first === undefined || second === undefined) throw new Error('Faltan archivos del mundo');
    fileA = first;
    fileB = second;
    await world.withUploads(app, a, 1);
    await world.withUploads(app, b, 1);
    transactions = app.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    context = app.app.get(TransactionContext);
  });

  afterAll(async () => {
    await app?.close();
    if (database?.isInitialized) await database.destroy();
    await owner?.destroy();
    await world?.close();
  });

  const issue = (account: WorldAccount, id: string) =>
    request(app.app.getHttpServer())
      .post(`/api/v1/files/${id}/preview-url`)
      .auth(world.tokenFor(account), { type: 'bearer' });

  const asActor = <T>(account: WorldAccount, work: (actor: Actor) => Promise<T>) => {
    const actor = createActor(account.id, account.role);
    return transactions.withActor(actor, () => work(actor));
  };

  it('CA-5: el flujo corre como nimbo_app sin superusuario/BYPASSRLS y las tres tablas fuerzan RLS', async () => {
    const [role] = (await database.query(
      'SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    )) as { name: string; rolsuper: boolean; rolbypassrls: boolean }[];
    expect(role).toEqual({ name: 'nimbo_app', rolsuper: false, rolbypassrls: false });
    const tables = (await database.query(
      'SELECT relname, relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relname = ANY($1)',
      [['archivo', 'version_archivo', 'carga']],
    )) as {
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      owner: string;
    }[];
    expect(tables).toHaveLength(3);
    for (const table of tables) {
      expect(table).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
      expect(table.owner).not.toBe('nimbo_app');
    }
  });

  it('CA-3, CA-11: dueño autenticado obtiene preview; sin sesión recibe 401', async () => {
    const allowed = await issue(a, fileA.id);
    expect(allowed.status).toBe(200);
    expect(previewUrlResponseSchema.parse(allowed.body).file.id).toBe(fileA.id);
    const anonymous = await request(app.app.getHttpServer()).post(
      `/api/v1/files/${fileA.id}/preview-url`,
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe('SHARED_UNAUTHENTICATED');
  });

  it('CA-5: ajeno e inexistente son el mismo 404 sin datos privados', async () => {
    const foreign = await issue(b, fileA.id);
    const missing = await issue(b, randomUUID());
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('STORAGE_NODE_NOT_FOUND');
    expect(
      expect.arrayContaining([comparable(missing)]).asymmetricMatch([comparable(foreign)]),
    ).toBe(true);
    expect(foreign.body.correlationId).not.toBe(missing.body.correlationId);
    expect(JSON.stringify(foreign.body).includes(fileA.name)).toBe(false);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'CA-4: %s recibe 403 por HTTP y en la fachada directa',
    async (role) => {
      const account = world.internals[role];
      const response = await issue(account, fileA.id);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('SHARED_FORBIDDEN');
      const failure: unknown = await app.app
        .get(StoragePreviewFacade)
        .issueUrl(createActor(account.id, role), fileA.id)
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure).toMatchObject({ status: 403, code: 'SHARED_FORBIDDEN' });
    },
  );

  it('CA-5: sin contexto el repositorio rechaza y SQL directo no ve archivo, versión ni carga', async () => {
    const actor = createActor(a.id, Role.CLIENT);
    const failure: unknown = await app.app
      .get<INodeRepository>(I_NODE_REPOSITORY)
      .findAccessibleById(actor, fileA.id)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(ActorScopeMissingError);
    for (const sql of [
      'SELECT id FROM archivo WHERE propietario_id = ANY($1)',
      'SELECT id FROM version_archivo WHERE archivo_id = ANY($1)',
      'SELECT id FROM carga WHERE propietario_id = ANY($1)',
    ]) {
      const ids = sql.includes('archivo_id') ? [fileA.id, fileB.id] : [a.id, b.id];
      expect(await database.query(sql, [ids])).toEqual([]);
    }
  });

  it('CA-5: B no hereda el actor de A en la misma conexión del pool, ni tras un 404', async () => {
    const pid = async () => {
      const [row] = (await database.query(
        'SELECT pg_backend_pid() AS pid, nimbo_actor_id() AS actor',
      )) as { pid: number; actor: string | null }[];
      expect(row?.actor).toBeNull();
      return row?.pid;
    };
    const firstPid = await pid();
    expect((await issue(a, fileA.id)).status).toBe(200);
    expect(await pid()).toBe(firstPid);
    expect((await issue(b, fileA.id)).status).toBe(404);
    expect(await pid()).toBe(firstPid);
    expect((await issue(b, fileB.id)).status).toBe(200);
    expect(await pid()).toBe(firstPid);
    expect((await issue(a, fileB.id)).status).toBe(404);
    expect(await pid()).toBe(firstPid);
  });

  it('CA-5: RLS limita las relaciones de versión y carga incluso sin accessibleNodes', async () => {
    const rows = await asActor(b, async (actor) => {
      const manager = context.requireActorScope(actor);
      return {
        versions: (await manager.query(
          'SELECT v.archivo_id AS id FROM archivo a JOIN version_archivo v ON v.id = a.version_actual_id WHERE a.id = ANY($1)',
          [[fileA.id, fileB.id]],
        )) as { id: string }[],
        uploads: (await manager.query(
          'SELECT propietario_id AS id FROM carga WHERE propietario_id = ANY($1)',
          [[a.id, b.id]],
        )) as { id: string }[],
      };
    });
    expect(rows.versions).toEqual([{ id: fileB.id }]);
    expect(rows.uploads).toEqual([{ id: b.id }]);
  });

  it('CA-5: una referencia incoherente conserva el namespace permitido sin utilizar la clave real ajena', async () => {
    const versions = (await owner.query(
      'SELECT archivo_id AS file, id, clave_objeto AS key FROM version_archivo WHERE archivo_id = ANY($1)',
      [[fileA.id, fileB.id]],
    )) as { file: string; id: string; key: string }[];
    const own = versions.find((row) => row.file === fileA.id);
    const foreign = versions.find((row) => row.file === fileB.id);
    if (own === undefined || foreign === undefined) throw new Error('Faltan versiones del mundo');
    // Fixture adversarial como dueño; no altera políticas ni migraciones. Se restaura aun si falla.
    await owner.query('UPDATE archivo SET version_actual_id = $1 WHERE id = $2', [
      foreign.id,
      fileA.id,
    ]);
    try {
      const visible = await asActor(a, (actor) =>
        context
          .requireActorScope(actor)
          .query(
            'SELECT v.clave_objeto FROM archivo a JOIN version_archivo v ON v.id = a.version_actual_id WHERE a.id = $1',
            [fileA.id],
          ),
      );
      expect(Array.isArray(visible) && visible.length === 0).toBe(true);
      const response = await issue(a, fileA.id);
      expect(response.status).toBe(200);
      const signed = new URL(previewUrlResponseSchema.parse(response.body).url);
      // El UUID referenciado es visible; este fixture de filas no acredita entrega de bytes.
      const path = decodeURIComponent(signed.pathname);
      expect(path.includes(`/u/${a.id}/${fileA.id}/${foreign.id}`)).toBe(true);
      expect(path.includes(foreign.key)).toBe(false);
    } finally {
      await owner.query('UPDATE archivo SET version_actual_id = $1 WHERE id = $2', [
        own.id,
        fileA.id,
      ]);
    }
  });
});
