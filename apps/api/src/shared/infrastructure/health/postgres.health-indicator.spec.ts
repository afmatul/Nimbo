import type { DataSource, QueryRunner } from 'typeorm';

import { READY_TIMEOUT_MS } from '../../application/health/health.service';

import { PostgresHealthIndicator } from './postgres.health-indicator';

/** Doble del `QueryRunner` que registra el orden exacto de las llamadas. */
const buildQueryRunner = (): { runner: QueryRunner; calls: string[]; queries: string[] } => {
  const calls: string[] = [];
  const queries: string[] = [];
  const runner = {
    connect: async (): Promise<void> => {
      calls.push('connect');
    },
    startTransaction: async (): Promise<void> => {
      calls.push('startTransaction');
    },
    query: async (sql: string): Promise<unknown> => {
      calls.push('query');
      queries.push(sql);
      return [{ '?column?': 1 }];
    },
    rollbackTransaction: async (): Promise<void> => {
      calls.push('rollbackTransaction');
    },
    release: async (): Promise<void> => {
      calls.push('release');
    },
  } as unknown as QueryRunner;
  return { runner, calls, queries };
};

const buildDataSource = (runner: QueryRunner): DataSource =>
  ({ createQueryRunner: (): QueryRunner => runner }) as unknown as DataSource;

describe('PostgresHealthIndicator', () => {
  it('CA-21: se llama `postgres`', () => {
    const { runner } = buildQueryRunner();
    expect(new PostgresHealthIndicator(buildDataSource(runner)).name).toBe('postgres');
  });

  it('CA-21: limita la sonda con `statement_timeout` alineado a `READY_TIMEOUT_MS`', async () => {
    const { runner, queries } = buildQueryRunner();

    const status = await new PostgresHealthIndicator(buildDataSource(runner)).check();

    expect(status).toBe('up');
    expect(queries[0]).toBe(`SET LOCAL statement_timeout = ${READY_TIMEOUT_MS}`);
    expect(queries[1]).toBe('SELECT 1');
  });

  it('CA-21: devuelve la conexión al pool sin el ajuste pegado, incluso si la consulta falla', async () => {
    const { runner, calls } = buildQueryRunner();
    const failing = {
      ...runner,
      query: async (sql: string): Promise<unknown> => {
        calls.push('query');
        if (sql === 'SELECT 1') {
          throw new Error('canceling statement due to statement timeout');
        }
        return [];
      },
    } as unknown as QueryRunner;

    await expect(new PostgresHealthIndicator(buildDataSource(failing)).check()).rejects.toThrow(
      'statement timeout',
    );
    // `SET LOCAL` solo vive dentro de la transacción: al revertirla la conexión vuelve limpia.
    expect(calls).toContain('rollbackTransaction');
    expect(calls[calls.length - 1]).toBe('release');
  });
});
