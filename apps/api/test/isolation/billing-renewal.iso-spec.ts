import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { TEST_CARDS } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { ContentMatchBindingModule } from '../../src/content-match-binding.module';
import { BillingHttpModule } from '../../src/modules/billing';
import { StorageModule } from '../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../src/plan-limits-binding.module';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { buildTestEnv, createTestApp } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { insertAccount } from '../int/storage/storage-test-db';
import { connectAsOwner, connectTo, requiredEnv } from '../support/database-urls';
import { clearMailQueue } from '../support/mail-queue';

import { createIsolationWorld } from './setup/isolation-world';
import type { InternalRole, IsolationWorld, WorldAccount } from './setup/isolation-world';
import { RESTRICTED_OWNER_ROLE, startRestrictedOwnerDatabase } from './setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from './setup/nosuperuser-postgres';

const INTERNAL_ROLES: readonly InternalRole[] = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR];
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const DAY_MS = 86_400_000;
const TO_RENEW = 'suscripciones_por_renovar(integer)';
const TO_REMIND = 'suscripciones_por_avisar(integer, integer)';
const SRC = join(__dirname, '../../src');

/** El código sin comentarios: la regla de ADR-0031 es sobre consultas, no sobre la documentación que nombra la columna. */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Ruta con `/` también en Windows, donde `join` y `relative` devuelven `\\`. */
const posix = (path: string): string => path.split('\\').join('/');

/** Todos los `.ts` de producción de `apps/api/src` (sin pruebas). */
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [path] : [];
  });

/**
 * Funciones de la pasada con un dueño **NOSUPERUSER** (spec 010 CA-24; ADR-0021): sin esto pasarían en vacío, porque un
 * superusuario ignora RLS y `suscripcion_mantenimiento` sería inerte. Las filas se insertan como cada cliente.
 */
describe('pasada de renovación sin actor con dueño NOSUPERUSER (spec 010 CA-24, ADR-0021)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  const ids = { due: '', expiring: '', later: '', noticed: '' };

  /** La suscripción de Equipo del cliente, escrita como él (el dueño no tiene política de `INSERT`). */
  const subscribe = async (expiresInMs: number, patch = ''): Promise<string> => {
    const actor = createActor(await insertAccount(owner), Role.CLIENT);
    const expiresAt = new Date(Date.now() + expiresInMs);
    await transactions.withActor(actor, () =>
      context.requireActorScope(actor).query(
        `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en${patch === '' ? '' : ', estado, aviso_vencida_para'})
           VALUES ($1, $2, $3, $4${patch === '' ? '' : ", 'solo_lectura', $4"})`,
        [actor.id, TEAM_ID, new Date(expiresAt.getTime() - 30 * DAY_MS), expiresAt],
      ),
    );
    return actor.id;
  };

  const call = async (sql: string, params: unknown[]): Promise<Record<string, unknown>[]> =>
    (await app.query(sql, params)) as Record<string, unknown>[];

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    ids.due = await subscribe(-DAY_MS);
    ids.expiring = await subscribe(2 * DAY_MS);
    ids.later = await subscribe(10 * DAY_MS);
    ids.noticed = await subscribe(-DAY_MS, 'solo_lectura');
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('ADR-0021: el dueño de `suscripcion` es el rol restringido, sin superusuario ni BYPASSRLS', async () => {
    const [row] = (await owner.query(
      `SELECT r.rolname AS owner, r.rolsuper, r.rolbypassrls
         FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE c.oid = 'public.suscripcion'::regclass`,
    )) as { owner: string; rolsuper: boolean; rolbypassrls: boolean }[];

    expect(row).toEqual({ owner: RESTRICTED_OWNER_ROLE, rolsuper: false, rolbypassrls: false });
  });

  it('CA-24: `nimbo_app` sin actor ve 0 filas de `suscripcion` por consulta directa', async () => {
    await expect(call('SELECT count(*)::int AS total FROM suscripcion', [])).resolves.toEqual([
      { total: 0 },
    ]);
  });

  it('CA-1, M-3: `suscripciones_por_renovar` da solo ids de las vencidas, sin las que ya tienen su correo de vencida', async () => {
    const rows = await call('SELECT * FROM suscripciones_por_renovar($1)', [1000]);

    expect(Object.keys(rows[0] ?? {})).toEqual(['usuario_id']);
    const listed = rows.map((row) => row.usuario_id);
    expect(listed).toContain(ids.due);
    expect(listed).not.toContain(ids.noticed);
    expect(listed).not.toContain(ids.expiring);
  });

  it('CA-5, RN-8: `suscripciones_por_avisar` da las que vencen dentro de los días pedidos, con tope de 7', async () => {
    const inThree = (await call('SELECT * FROM suscripciones_por_avisar($1, $2)', [3, 1000])).map(
      (row) => row.usuario_id,
    );
    const capped = (await call('SELECT * FROM suscripciones_por_avisar($1, $2)', [30, 1000])).map(
      (row) => row.usuario_id,
    );

    expect(inThree).toEqual([ids.expiring]);
    expect(capped).not.toContain(ids.later);
  });

  it.each([
    ['suscripciones_por_renovar', 'SELECT * FROM suscripciones_por_renovar(10)'],
    ['suscripciones_por_avisar', 'SELECT * FROM suscripciones_por_avisar(3, 10)'],
  ])('ADR-0021: %s falla con un actor en la sesión', async (name, sql) => {
    const actor: Actor = createActor(ids.due, Role.CLIENT);

    await expect(
      transactions.withActor(actor, () => context.requireActorScope(actor).query(sql)),
    ).rejects.toThrow(`${name} solo corre sin actor`);
  });

  it.each([TO_RENEW, TO_REMIND])(
    'ADR-0021: `PUBLIC` no puede ejecutar %s; `nimbo_app` sí',
    async (signature) => {
      const [row] = (await owner.query(
        `SELECT has_function_privilege('public', $1, 'EXECUTE') AS public,
              has_function_privilege('nimbo_app', $1, 'EXECUTE') AS app`,
        [signature],
      )) as { public: boolean; app: boolean }[];

      expect(row).toEqual({ public: false, app: true });
    },
  );
});

/**
 * Aislamiento por cuenta con tokens reales (spec 010 CA-23, CA-24; ADR-0031): A cambia solo su fila, nunca ve la de B ni
 * su referencia, la referencia no sale en ninguna respuesta, la solo lectura de A no toca las cargas de B y los roles
 * internos no llegan a las rutas de la 010.
 */
describe('aislamiento de la renovación por cuenta (spec 010 CA-23, CA-24; ADR-0031)', () => {
  let world: IsolationWorld;
  let testApp: TestApp;
  let owner: DataSource;
  let a: WorldAccount;
  let b: WorldAccount;
  const bodies: unknown[] = [];

  const as = (account: WorldAccount) => {
    const auth = { Authorization: `Bearer ${world.tokenFor(account)}` };
    const http = () => request(testApp.app.getHttpServer());
    return {
      put: (path: string, body: object) => http().put(`/api/v1/${path}`).set(auth).send(body),
      post: (path: string, body?: object) => http().post(`/api/v1/${path}`).set(auth).send(body),
      delete: (path: string) => http().delete(`/api/v1/${path}`).set(auth),
      get: (path: string) => http().get(`/api/v1/${path}`).set(auth),
    };
  };

  const record = <T extends { body: unknown }>(response: T): T => (
    bodies.push(response.body),
    response
  );

  beforeAll(async () => {
    world = await createIsolationWorld();
    const composition = world.appComposition();
    const env = buildTestEnv({ ...composition.env, DATABASE_URL: requiredEnv('DATABASE_URL') });
    const storage = StorageModule.forRoot(env);
    testApp = await createTestApp({
      validatedEnv: env,
      accessTokenStrategy: composition.accessTokenStrategy,
      modules: [
        ...composition.modules,
        PlanLimitsBindingModule,
        ContentMatchBindingModule,
        storage,
        BillingHttpModule.forRoot(env, storage),
      ],
    });
    owner = await connectAsOwner();
    [a, b] = world.clients;
    for (const account of [a, b]) {
      record(
        await as(account).post('billing/subscribe', {
          planSlug: 'equipo',
          card: { number: TEST_CARDS.approved, expMonth: 12, expYear: 2030, cvc: '123' },
          nit: 'CF',
        }),
      );
    }
  });

  afterAll(async () => {
    await testApp?.close();
    await clearMailQueue();
    const ids = world?.clients.map((account) => account.id) ?? [];
    await owner?.query('DELETE FROM factura WHERE usuario_id = ANY($1)', [ids]);
    await owner?.query('DELETE FROM transaccion WHERE usuario_id = ANY($1)', [ids]);
    await owner?.destroy();
    await world?.close();
  });

  it('CA-24: A apaga su renovación automática y la fila de B no cambia', async () => {
    record(await as(a).put('billing/subscription/auto-renew', { enabled: false }));

    const rows = (await owner.query(
      'SELECT usuario_id, renovacion_automatica FROM suscripcion WHERE usuario_id = ANY($1) ORDER BY usuario_id',
      [[a.id, b.id]],
    )) as { usuario_id: string; renovacion_automatica: boolean }[];

    expect(
      Object.fromEntries(rows.map((row) => [row.usuario_id, row.renovacion_automatica])),
    ).toEqual({
      [a.id]: false,
      [b.id]: true,
    });
  });

  it('CA-24, ADR-0031: como A, RLS solo devuelve su suscripción y sus referencias, nunca las de B', async () => {
    const runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    const context = testApp.app.get(TransactionContext);
    const actor = createActor(a.id, Role.CLIENT);

    const seen = await runner.withActor(actor, async () => {
      const manager = context.requireActorScope(actor);
      const owners = (rows: { usuario_id: string }[]) => [
        ...new Set(rows.map((row) => row.usuario_id)),
      ];
      return {
        subscriptions: owners(await manager.query('SELECT usuario_id FROM suscripcion')),
        references: owners(
          await manager.query(
            'SELECT usuario_id FROM transaccion WHERE referencia_instrumento IS NOT NULL',
          ),
        ),
      };
    });

    expect(seen).toEqual({ subscriptions: [a.id], references: [a.id] });
  });

  it('ADR-0031: la referencia del instrumento no sale en ninguna respuesta (contratar, ajustes, historial)', async () => {
    record(await as(a).get('billing/history'));
    record(await as(b).get('billing/history'));

    expect(bodies.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(bodies)).not.toContain('SIM-TOK');
  });

  it('CA-13, CA-24: con A en solo lectura, A no puede iniciar una carga y B sí', async () => {
    await owner.query(
      `UPDATE suscripcion SET estado = 'solo_lectura', vence_en = now() - interval '1 day' WHERE usuario_id = $1`,
      [a.id],
    );
    const upload = { name: 'informe.pdf', sizeBytes: 1024, onConflict: 'ask', folderId: null };

    const fromA = await as(a).post('uploads', upload);
    const fromB = await as(b).post('uploads', upload);

    expect(fromA.status).toBe(403);
    expect(fromA.body).toMatchObject({ code: 'STORAGE_ACCOUNT_READ_ONLY' });
    expect(fromB.status).toBe(201);
    await as(b).delete(`uploads/${(fromB.body as { uploadId: string }).uploadId}`);
  });

  it.each(INTERNAL_ROLES)(
    'CA-23: un %s recibe 403 en las cuatro rutas de la 010 y nada cambia',
    async (role) => {
      const internal = as(world.internals[role]);
      const before = await owner.query('SELECT * FROM suscripcion WHERE usuario_id = $1', [b.id]);

      const statuses = [
        (await internal.put('billing/subscription/auto-renew', { enabled: false })).status,
        (
          await internal.post('billing/renew', {
            card: {},
            nit: 'CF',
            expectedExpiresAt: new Date().toISOString(),
          })
        ).status,
        (await internal.put('billing/subscription/plan-change', { planSlug: 'pro' })).status,
        (await internal.delete('billing/subscription/plan-change')).status,
      ];

      expect(statuses).toEqual([403, 403, 403, 403]);
      await expect(
        owner.query('SELECT * FROM suscripcion WHERE usuario_id = $1', [b.id]),
      ).resolves.toEqual(before);
    },
  );

  it('ADR-0031, 010a-4: solo el repositorio de pagos y la redacción del logger usan `referencia_instrumento` en código', () => {
    const naming = sourceFiles(SRC)
      .filter((path) => !posix(path).includes('/migrations/'))
      .filter((path) =>
        withoutComments(readFileSync(path, 'utf8')).includes('referencia_instrumento'),
      )
      .map((path) => posix(relative(SRC, path)))
      .sort();
    const repository = readFileSync(
      join(SRC, 'modules/billing/infrastructure/persistence/typeorm-payment.repository.ts'),
      'utf8',
    );

    expect(naming).toEqual([
      'modules/billing/infrastructure/persistence/typeorm-payment.repository.ts',
      'shared/infrastructure/logging/redacted-fields.ts',
    ]);
    expect(repository.match(/lastApprovedPaymentSql\([^)]*referencia_instrumento/g)).toHaveLength(
      1,
    );
  });
});
