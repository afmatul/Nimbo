import type { DataSource } from 'typeorm';

import { createActor, Role } from '../../src/shared';
import type { Actor } from '../../src/shared';
import { TransactionContext } from '../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { insertAccount } from '../int/storage/storage-test-db';
import { connectTo } from '../support/database-urls';

import { startRestrictedOwnerDatabase } from './setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from './setup/nosuperuser-postgres';

const TEAM_PLAN_ID = '10000000-0000-4000-8000-000000000003';
const PLAN_NAMES = 'nombres_de_plan_por_cliente(uuid[])';
const CLIENT_COUNTS = 'conteo_de_clientes_por_plan()';
const PLAN_NAMES_SQL = 'SELECT * FROM nombres_de_plan_por_cliente($1::uuid[])';
const CLIENT_COUNTS_SQL = 'SELECT * FROM conteo_de_clientes_por_plan()';

/**
 * Lecturas de `suscripcion` de los roles internos con un dueño `NOSUPERUSER` (spec 009 T-03; ADR-0021; spec §5): el
 * Administrador lee nombres y conteos; el Operador solo conteos; Soporte y el cliente, ninguna; `PUBLIC` no ejecuta.
 * Con un dueño sin `SUPERUSER`, la política `suscripcion_administracion` es lo que deja leer a las funciones.
 */
describe('lecturas de suscripción de los roles internos (009 T-03, ADR-0021)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let ana: Actor;
  const actors = {} as Record<Role, Actor>;

  const as = <T>(actor: Actor, sql: string, params: unknown[] = []): Promise<T> =>
    transactions.withActor(
      actor,
      () => context.requireActorScope(actor).query(sql, params) as Promise<T>,
    );

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    ana = createActor(await insertAccount(owner), Role.CLIENT);
    await transactions.withActor(ana, () =>
      context
        .requireActorScope(ana)
        .query('INSERT INTO suscripcion (usuario_id, plan_id) VALUES ($1, $2)', [
          ana.id,
          TEAM_PLAN_ID,
        ]),
    );
    for (const role of [Role.ADMIN, Role.SUPPORT, Role.OPERATOR]) {
      actors[role] = createActor(await insertAccount(owner, role), role);
    }
    actors[Role.CLIENT] = ana;
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('011 CA-1: el Administrador lee el plan de un cliente y los conteos', async () => {
    await expect(as(actors[Role.ADMIN], PLAN_NAMES_SQL, [[ana.id]])).resolves.toEqual([
      { usuario_id: ana.id, plan: 'Equipo' },
    ]);
    await expect(as(actors[Role.ADMIN], CLIENT_COUNTS_SQL)).resolves.toEqual([
      { plan_id: TEAM_PLAN_ID, clientes: 1 },
    ]);
  });

  it('011 CA-12, spec §5: el Operador solo lee conteos, nunca el plan de un cliente', async () => {
    await expect(as(actors[Role.OPERATOR], CLIENT_COUNTS_SQL)).resolves.toEqual([
      { plan_id: TEAM_PLAN_ID, clientes: 1 },
    ]);
    await expect(as(actors[Role.OPERATOR], PLAN_NAMES_SQL, [[ana.id]])).rejects.toThrow(
      /solo la usa un administrador/,
    );
  });

  it.each([Role.SUPPORT, Role.CLIENT] as const)(
    'spec §5: %s no ejecuta ninguna de las dos',
    async (role) => {
      await expect(as(actors[role], PLAN_NAMES_SQL, [[ana.id]])).rejects.toThrow(
        /insufficient|solo la usa/,
      );
      await expect(as(actors[role], CLIENT_COUNTS_SQL)).rejects.toThrow(/solo lo usan/);
    },
  );

  it('ADR-0021: sin actor ninguna corre', async () => {
    await expect(app.query(PLAN_NAMES_SQL, [[ana.id]])).rejects.toThrow(/solo la usa/);
    await expect(app.query(CLIENT_COUNTS_SQL)).rejects.toThrow(/solo lo usan/);
  });

  it('ADR-0021: más de 100 clientes por llamada falla', async () => {
    const many = Array.from({ length: 101 }, () => ana.id);

    await expect(as(actors[Role.ADMIN], PLAN_NAMES_SQL, [many])).rejects.toThrow(/hasta 100/);
  });

  it('ADR-0021: `PUBLIC` no ejecuta ninguna; `nimbo_app` sí', async () => {
    const privilegesOf = async (signature: string) => {
      const [row] = (await owner.query(
        `SELECT has_function_privilege('public', $1, 'EXECUTE') AS public,
                has_function_privilege('nimbo_app', $1, 'EXECUTE') AS app`,
        [signature],
      )) as { public: boolean; app: boolean }[];
      return row;
    };
    const privileges = [await privilegesOf(PLAN_NAMES), await privilegesOf(CLIENT_COUNTS)];

    expect(privileges).toEqual([
      { public: false, app: true },
      { public: false, app: true },
    ]);
  });

  it('RNF-05: con actor interno, `suscripcion` directa sigue sin filas (solo por las funciones)', async () => {
    for (const role of [Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const) {
      await expect(as(actors[role], 'SELECT usuario_id FROM suscripcion')).resolves.toEqual([]);
    }
  });
});
