import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';

const TABLE = 'prueba_transaccion';
const TICK_MS = 20;

/** `ITransactionRunner` sobre Postgres real (001 plan §6.7; base de `withActor` en 003). */
describe('TypeOrmTransactionRunner (CA-3, CA-29)', () => {
  let dataSource: DataSource;
  let context: TransactionContext;
  let runner: TypeOrmTransactionRunner;

  const insert = (id: string): Promise<unknown> =>
    context.manager().query(`INSERT INTO ${TABLE} (id) VALUES ($1)`, [id]);

  const exists = async (id: string): Promise<boolean> => {
    const rows = (await dataSource.query(`SELECT 1 FROM ${TABLE} WHERE id = $1`, [
      id,
    ])) as unknown[];
    return rows.length > 0;
  };

  beforeAll(async () => {
    dataSource = new DataSource(
      buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
    );
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE ${TABLE} (id uuid PRIMARY KEY)`);
    context = new TransactionContext(dataSource);
    runner = new TypeOrmTransactionRunner(dataSource, context);
  });

  afterAll(async () => {
    await dataSource.query(`DROP TABLE ${TABLE}`);
    await dataSource.destroy();
  });

  it('CA-3: `run` confirma lo escrito', async () => {
    const id = randomUUID();

    await runner.run(() => insert(id));

    await expect(exists(id)).resolves.toBe(true);
  });

  it('CA-3: si el trabajo lanza, revierte y relanza', async () => {
    const id = randomUUID();

    await expect(
      runner.run(async () => {
        await insert(id);
        throw new Error('fallo a propósito');
      }),
    ).rejects.toThrow('fallo a propósito');

    await expect(exists(id)).resolves.toBe(false);
  });

  it('CA-3: dentro de `run`, `manager()` es el de la transacción, también tras un `await`', async () => {
    await runner.run(async () => {
      const manager = context.manager();
      expect(manager).not.toBe(dataSource.manager);
      expect(manager.queryRunner?.isTransactionActive).toBe(true);

      await sleep(TICK_MS);

      expect(context.manager()).toBe(manager);
    });
  });

  it('CA-3: fuera de `run`, `manager()` es el del `DataSource`', () => {
    expect(context.manager()).toBe(dataSource.manager);
  });

  it('CA-29: dos `run` concurrentes no comparten contexto ni ven lo no confirmado del otro', async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    const work = (own: string, other: string) => async () => {
      await insert(own);
      await sleep(TICK_MS);
      const rows = (await context
        .manager()
        .query(`SELECT id FROM ${TABLE} WHERE id IN ($1, $2)`, [own, other])) as {
        id: string;
      }[];
      return { manager: context.manager(), ids: rows.map((row) => row.id) };
    };

    const [a, b] = await Promise.all([
      runner.run(work(first, second)),
      runner.run(work(second, first)),
    ]);

    expect(a.manager).not.toBe(b.manager);
    expect(a.ids).toEqual([first]);
    expect(b.ids).toEqual([second]);
  });
});
