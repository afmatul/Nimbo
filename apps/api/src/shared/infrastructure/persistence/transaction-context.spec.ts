import type { DataSource, EntityManager } from 'typeorm';

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
