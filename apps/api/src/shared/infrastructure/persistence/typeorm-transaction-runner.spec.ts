import type { DataSource, EntityManager } from 'typeorm';

import type { Actor } from '../../domain/actor';
import { Role } from '../../domain/role.enum';

import { ActorScopeConflictError, InvalidActorError } from './actor-scope.errors';
import { TransactionContext } from './transaction-context';
import { TypeOrmTransactionRunner } from './typeorm-transaction-runner';

/** El SQL exacto que el runner debe emitir (plan §6.3): la prueba lo nombra para fijarlo, no para ejecutarlo. */
// eslint-disable-next-line no-restricted-syntax -- la prueba del runner compara el SQL que emite `withActor`
const SET_ACTOR_SQL = 'SELECT set_config($1, $2, true), set_config($3, $4, true)';
const CLIENT_ID = '0f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const OTHER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const anActor = (patch: Partial<Actor> = {}): Actor => ({
  id: CLIENT_ID,
  role: Role.CLIENT,
  canReadContent: true,
  ...patch,
});

/** `DataSource` falso: cada `transaction` entrega un manager nuevo con `query` espiable. */
const setup = () => {
  const managers: { query: jest.Mock }[] = [];
  const transaction = jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) => {
    const manager = { query: jest.fn(() => Promise.resolve([])) };
    managers.push(manager);
    return work(manager as unknown as EntityManager);
  });
  const dataSource = { manager: {}, transaction } as unknown as DataSource;
  const context = new TransactionContext(dataSource);
  return {
    context,
    runner: new TypeOrmTransactionRunner(dataSource, context),
    transaction,
    managers,
  };
};

describe('TypeOrmTransactionRunner.withActor (003 CA-12)', () => {
  it.each([
    ['un `id` que no es UUID', anActor({ id: 'no-es-uuid' })],
    ['un `id` con SQL', anActor({ id: `${CLIENT_ID}'; --` })],
    ['un rol fuera de `Role`', anActor({ role: 'ROOT' as Role })],
  ])('CA-12: con %s lanza antes de abrir la transacción', async (_label, actor) => {
    const { runner, transaction } = setup();
    const work = jest.fn(() => Promise.resolve());

    await expect(runner.withActor(actor, work)).rejects.toThrow(InvalidActorError);

    expect(transaction).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it('CA-12: sin contexto abre una transacción, fija el actor con un solo `set_config` enlazado y corre `work` con `{ manager, actor }`', async () => {
    const { runner, context, transaction, managers } = setup();
    const actor = anActor();

    const scope = await runner.withActor(actor, () => Promise.resolve(context.current()));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(managers[0]?.query).toHaveBeenCalledTimes(1);
    expect(managers[0]?.query).toHaveBeenCalledWith(SET_ACTOR_SQL, [
      'app.actor_id',
      CLIENT_ID,
      'app.actor_role',
      Role.CLIENT,
    ]);
    expect(scope).toEqual({ manager: managers[0], actor });
    expect(context.current()).toBeUndefined();
  });

  it('CA-12: dentro de `withActor` con el mismo actor es reentrante (sin otra transacción ni otro `set_config`)', async () => {
    const { runner, context, transaction, managers } = setup();

    const inner = await runner.withActor(anActor(), () =>
      runner.withActor(anActor(), () => Promise.resolve(context.requireActorScope(anActor()))),
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(managers[0]?.query).toHaveBeenCalledTimes(1);
    expect(inner).toBe(managers[0]);
  });

  it.each([
    ['otro `id`', anActor({ id: OTHER_ID })],
    ['otro rol', anActor({ role: Role.SUPPORT })],
  ])(
    'CA-12: dentro de `withActor` con %s lanza `ActorScopeConflictError`',
    async (_label, other) => {
      const { runner, transaction } = setup();
      const work = jest.fn(() => Promise.resolve());

      await expect(
        runner.withActor(anActor(), () => runner.withActor(other, work)),
      ).rejects.toThrow(ActorScopeConflictError);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(work).not.toHaveBeenCalled();
    },
  );

  it('CA-12: dentro de un `run` sin actor lanza `ActorScopeConflictError` (no fija el actor a mitad de otra transacción)', async () => {
    const { runner, transaction, managers } = setup();
    const work = jest.fn(() => Promise.resolve());

    await expect(runner.run(() => runner.withActor(anActor(), work))).rejects.toThrow(
      ActorScopeConflictError,
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(managers[0]?.query).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it('CA-12: `run` dentro de `withActor` se une a la transacción y conserva el actor', async () => {
    const { runner, context, transaction, managers } = setup();
    const actor = anActor();

    const inner = await runner.withActor(actor, () =>
      runner.run(() => Promise.resolve(context.current())),
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(inner).toEqual({ manager: managers[0], actor });
  });

  it('CA-12: `run` fuera de `withActor` sigue abriendo su transacción sin actor (001)', async () => {
    const { runner, context, transaction, managers } = setup();

    const scope = await runner.run(() => Promise.resolve(context.current()));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(managers[0]?.query).not.toHaveBeenCalled();
    expect(scope).toEqual({ manager: managers[0] });
  });
});
