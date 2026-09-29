import type { DataSource, EntityManager } from 'typeorm';

import type { Actor } from '../../domain/actor';
import { Role } from '../../domain/role.enum';

import { ActorScopeConflictError, ActorScopeMissingError } from './actor-scope.errors';
import { TransactionContext } from './transaction-context';
import { TypeOrmTransactionRunner } from './typeorm-transaction-runner';

const aManager = (label: string): EntityManager => ({ label }) as unknown as EntityManager;
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const fakeDataSource = () => {
  const rootManager = aManager('raíz');
  const transaction = jest.fn(async (work: (manager: EntityManager) => Promise<unknown>) =>
    work(aManager('transacción')),
  );
  return {
    dataSource: { manager: rootManager, transaction } as unknown as DataSource,
    rootManager,
    transaction,
  };
};

describe('TransactionContext y TypeOrmTransactionRunner (unidad, 001 CA-3, CA-29)', () => {
  it('CA-3: fuera de `run`, `manager()` es el del `DataSource`', () => {
    const { dataSource, rootManager } = fakeDataSource();

    expect(new TransactionContext(dataSource).manager()).toBe(rootManager);
  });

  it('CA-3: dentro de `run`, `manager()` es el de la transacción, también tras un `await`', async () => {
    const { dataSource, rootManager } = fakeDataSource();
    const context = new TransactionContext(dataSource);
    const runner = new TypeOrmTransactionRunner(dataSource, context);

    const seen = await runner.run(async () => {
      const before = context.manager();
      await tick();
      return [before, context.manager()];
    });

    expect(seen[0]).not.toBe(rootManager);
    expect(seen[1]).toBe(seen[0]);
    expect(context.manager()).toBe(rootManager);
  });

  it('CA-3: `run` devuelve el resultado del trabajo y relanza su error', async () => {
    const { dataSource } = fakeDataSource();
    const runner = new TypeOrmTransactionRunner(dataSource, new TransactionContext(dataSource));

    await expect(runner.run(() => Promise.resolve(42))).resolves.toBe(42);
    await expect(runner.run(() => Promise.reject(new Error('falló')))).rejects.toThrow('falló');
  });

  it('CA-29: dos `run` concurrentes no comparten contexto', async () => {
    const { dataSource } = fakeDataSource();
    const context = new TransactionContext(dataSource);
    const runner = new TypeOrmTransactionRunner(dataSource, context);
    const capture = async (): Promise<EntityManager> => {
      const first = context.manager();
      await tick();
      expect(context.manager()).toBe(first);
      return first;
    };

    const [a, b] = await Promise.all([runner.run(capture), runner.run(capture)]);

    expect(a).not.toBe(b);
  });
});

const CLIENT_ID = '0f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const OTHER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const anActor = (patch: Partial<Actor> = {}): Actor => ({
  id: CLIENT_ID,
  role: Role.CLIENT,
  canReadContent: true,
  ...patch,
});

describe('TransactionContext: ámbito de actor (003 CA-12)', () => {
  const setup = () => {
    const { dataSource } = fakeDataSource();
    return { context: new TransactionContext(dataSource), manager: aManager('con actor') };
  };

  it('CA-12: el contexto guarda el `EntityManager` y el actor, y `manager()` sigue devolviendo el de la transacción', async () => {
    const { context, manager } = setup();
    const actor = anActor();

    const seen = await context.runWith({ manager, actor }, () =>
      Promise.resolve({ manager: context.manager(), scope: context.current() }),
    );

    expect(seen).toEqual({ manager, scope: { manager, actor } });
    expect(context.current()).toBeUndefined();
  });

  it('CA-12: `requireActorScope` sin contexto lanza `ActorScopeMissingError` (nunca devuelve el manager raíz)', () => {
    const { context } = setup();

    expect(() => context.requireActorScope(anActor())).toThrow(ActorScopeMissingError);
  });

  it('CA-12: `requireActorScope` dentro de una transacción sin actor lanza `ActorScopeMissingError`', async () => {
    const { context, manager } = setup();

    await expect(
      context.runWith({ manager }, async () => context.requireActorScope(anActor())),
    ).rejects.toThrow(ActorScopeMissingError);
  });

  it.each([
    ['otro `id`', { id: OTHER_ID }],
    ['otro rol', { role: Role.ADMIN }],
  ])('CA-12: `requireActorScope` con %s lanza `ActorScopeConflictError`', async (_label, patch) => {
    const { context, manager } = setup();

    await expect(
      context.runWith({ manager, actor: anActor() }, async () =>
        context.requireActorScope(anActor(patch)),
      ),
    ).rejects.toThrow(ActorScopeConflictError);
  });

  it('CA-12: `requireActorScope` con el mismo actor devuelve el `EntityManager` de la transacción', async () => {
    const { context, manager } = setup();

    const scoped = await context.runWith({ manager, actor: anActor() }, async () =>
      context.requireActorScope(anActor()),
    );

    expect(scoped).toBe(manager);
  });

  it('CA-12: los dos errores son `Error` simples, no `DomainError` (salen como 500: son de programación)', () => {
    const missing = new ActorScopeMissingError();
    const conflict = new ActorScopeConflictError();

    expect(missing).toBeInstanceOf(Error);
    expect(conflict).toBeInstanceOf(Error);
    expect(missing).not.toHaveProperty('code');
    expect(conflict).not.toHaveProperty('code');
    expect(missing.name).toBe('ActorScopeMissingError');
    expect(conflict.name).toBe('ActorScopeConflictError');
  });
});
