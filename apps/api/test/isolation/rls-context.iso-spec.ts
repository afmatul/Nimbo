import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import type { Actor } from '../../src/shared';
import { buildDataSourceOptions, Role } from '../../src/shared';
import {
  ActorScopeConflictError,
  ActorScopeMissingError,
} from '../../src/shared/infrastructure/persistence/actor-scope.errors';
import { TransactionContext } from '../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';

const CONCURRENT_ACTORS = 20;
const SINGLE_CONNECTION = { max: 1 };

interface SessionActor {
  readonly pid: number;
  readonly actorId: string | null;
  readonly actorRole: string | null;
}

const aClient = (): Actor => ({ id: randomUUID(), role: Role.CLIENT, canReadContent: true });

const appUrl = (): string => {
  const url = process.env['DATABASE_URL'];
  if (url === undefined) throw new Error('El arnés no definió DATABASE_URL');
  return url;
};

const connectAsApp = (extra?: Record<string, unknown>): Promise<DataSource> =>
  new DataSource({ ...buildDataSourceOptions({ DATABASE_URL: appUrl() }), extra }).initialize();

/**
 * El actor de `withActor` vive solo en su transacción y en su conexión (003 CA-12, plan §6.3, ADR-0005), contra el
 * Postgres del arnés y como `nimbo_app`: una conexión del *pool* reutilizada no arrastra el actor anterior.
 */
describe('ámbito de actor en Postgres (CA-12)', () => {
  const setupRunner = (dataSource: DataSource) => {
    const context = new TransactionContext(dataSource);
    return { context, runner: new TypeOrmTransactionRunner(dataSource, context) };
  };

  const readSession = async (context: TransactionContext, actor: Actor): Promise<SessionActor> => {
    const [row] = (await context.requireActorScope(actor).query(
      `SELECT pg_backend_pid() AS pid, current_setting('app.actor_id') AS "actorId",
                current_setting('app.actor_role') AS "actorRole"`,
    )) as SessionActor[];
    if (row === undefined) throw new Error('La consulta de sesión no devolvió filas');
    return row;
  };

  describe('con una sola conexión (`extra.max = 1`)', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = await connectAsApp(SINGLE_CONNECTION);
    });

    afterAll(async () => {
      await dataSource.destroy();
    });

    it('CA-12: dos `withActor` seguidos con actores distintos ven cada uno el suyo en la misma conexión', async () => {
      const { context, runner } = setupRunner(dataSource);
      const [first, second] = [aClient(), { ...aClient(), role: Role.SUPPORT }];

      const a = await runner.withActor(first, () => readSession(context, first));
      const b = await runner.withActor(second, () => readSession(context, second));

      expect(b.pid).toBe(a.pid);
      expect(a).toMatchObject({ actorId: first.id, actorRole: Role.CLIENT });
      expect(b).toMatchObject({ actorId: second.id, actorRole: Role.SUPPORT });
    });

    it('CA-12: al terminar la transacción la conexión no conserva el actor (`nimbo_actor_id()` es NULL)', async () => {
      const { context, runner } = setupRunner(dataSource);
      const actor = aClient();
      const inside = await runner.withActor(actor, () => readSession(context, actor));

      const [after] = (await dataSource.query(
        `SELECT pg_backend_pid() AS pid, current_setting('app.actor_id', true) AS "actorId",
                nimbo_actor_id() AS "functionId"`,
      )) as { pid: number; actorId: string | null; functionId: string | null }[];

      expect(after?.pid).toBe(inside.pid);
      expect([null, '']).toContain(after?.actorId);
      expect(after?.functionId).toBeNull();
    });
  });

  describe('con el pool normal', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = await connectAsApp();
    });

    afterAll(async () => {
      await dataSource.destroy();
    });

    it(`CA-12: ${String(CONCURRENT_ACTORS)} \`withActor\` concurrentes ven cada uno su propio actor`, async () => {
      const { context, runner } = setupRunner(dataSource);
      const actors = Array.from({ length: CONCURRENT_ACTORS }, aClient);

      const seen = await Promise.all(
        actors.map((actor) =>
          runner.withActor(actor, async () => {
            await new Promise((resolve) => setImmediate(resolve));
            return readSession(context, actor);
          }),
        ),
      );

      expect(seen.map((session) => session.actorId)).toEqual(actors.map((actor) => actor.id));
    });

    it('CA-12: la reentrada con el mismo actor usa la misma transacción; con otro lanza `ActorScopeConflictError`', async () => {
      const { context, runner } = setupRunner(dataSource);
      const [actor, other] = [aClient(), aClient()];

      const [outer, inner] = await runner.withActor(actor, async () => {
        const before = await readSession(context, actor);
        const nested = await runner.withActor(actor, () => readSession(context, actor));
        return [before, nested];
      });
      const conflict = runner.withActor(actor, () =>
        runner.withActor(other, () => readSession(context, other)),
      );

      expect(inner).toEqual(outer);
      await expect(conflict).rejects.toThrow(ActorScopeConflictError);
    });

    it('CA-12: `requireActorScope` fuera de `withActor` lanza `ActorScopeMissingError` (nunca devuelve filas)', async () => {
      const { context, runner } = setupRunner(dataSource);
      const actor = aClient();

      expect(() => context.requireActorScope(actor)).toThrow(ActorScopeMissingError);
      await expect(runner.run(() => readSession(context, actor))).rejects.toThrow(
        ActorScopeMissingError,
      );
    });
  });
});
