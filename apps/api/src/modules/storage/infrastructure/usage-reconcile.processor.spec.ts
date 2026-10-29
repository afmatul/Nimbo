import type { Job } from 'bullmq';

import { CorrelationContext, createActor, FixedClock, Role } from '../../../shared';
import type { Actor, CorrelatedJobData, ITransactionRunner } from '../../../shared';
import type { IClientAccountScanner } from '../application/ports/i-client-account.scanner.port';
import type { StorageLogger } from '../application/storage-logger';
import { UsageReconcileIncompleteError } from '../application/usage-reconciler';
import type { UsageReconciler } from '../application/usage-reconciler';
import type { VersionPruner } from '../application/version-pruner';

import { UsageReconcileProcessor } from './usage-reconcile.processor';

const BATCH_SIZE = 2;
const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const JOB_ID = 'repeat:usage-reconcile:1';
const ACCOUNTS = [
  '0b9f4c1e-7a2d-4e5f-8c3b-1d2e3f4a5b6c',
  '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  '5c6b5a4f-3e2d-4c1b-9a8f-7e6d5c4b3a29',
] as const;
const NOW = new Date('2026-10-25T03:00:00.000Z');

interface LoggedLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly payload: Record<string, unknown>;
  readonly correlationId: string | undefined;
  readonly jobId: string | undefined;
}

const job = (data: Partial<CorrelatedJobData> = { correlationId: CORRELATION_ID }) =>
  ({ id: JOB_ID, data, attemptsMade: 0 }) as unknown as Job<CorrelatedJobData>;

/** Simula `SELECT id … WHERE id > $after ORDER BY id LIMIT $limit` sobre `accounts`. */
const pageOf = (accounts: readonly string[], afterId: string | null, limit: number) =>
  accounts.filter((id) => afterId === null || id > afterId).slice(0, limit);

interface SetupOptions {
  readonly accounts?: readonly string[];
  readonly failing?: readonly string[];
  /** Originales vencidos que purga cada cuenta (014b). */
  readonly keptPurged?: number;
}

const setup = (options: SetupOptions = {}) => {
  const accounts = options.accounts ?? ACCOUNTS;
  const journal: string[] = [];
  const lines: LoggedLine[] = [];
  const record =
    (level: LoggedLine['level']) =>
    (payload: Record<string, unknown>): void => {
      const store = CorrelationContext.get();
      lines.push({ level, payload, correlationId: store?.correlationId, jobId: store?.jobId });
    };
  const logger: StorageLogger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
  let insideRun = false;
  const transactions: ITransactionRunner = {
    run: async (work) => {
      insideRun = true;
      try {
        return await work();
      } finally {
        insideRun = false;
      }
    },
    withActor: (_actor, work) => work(),
  };
  const listClientIds = jest.fn((afterId: string | null, limit: number) => {
    journal.push(`scan:${String(insideRun)}:${String(afterId)}:${String(limit)}`);
    return Promise.resolve(pageOf(accounts, afterId, limit));
  });
  const scanner: IClientAccountScanner = { listClientIds };
  const reconcile = jest.fn((owner: Actor) => {
    journal.push(`reconcile:${owner.id}`);
    if (options.failing?.includes(owner.id) === true) {
      return Promise.reject(new Error(`falló la cuenta ${owner.id}`));
    }
    return Promise.resolve();
  });
  const reconciler = { reconcile } as unknown as UsageReconciler;
  const purgeExpiredOriginals = jest.fn((owner: Actor, now: Date) => {
    journal.push(`purge:${owner.id}:${now.toISOString()}`);
    return Promise.resolve(options.keptPurged ?? 0);
  });
  const pruner = { purgeExpiredOriginals } as unknown as VersionPruner;
  const processor = new UsageReconcileProcessor(
    transactions,
    scanner,
    reconciler,
    pruner,
    new FixedClock(NOW),
    { intervalMinutes: 1440, batchSize: BATCH_SIZE },
    logger,
  );
  return { processor, journal, lines, reconcile, purgeExpiredOriginals };
};

describe('UsageReconcileProcessor (spec 007 CA-13 a CA-15; plan §5)', () => {
  it('CA-13: consume la cola `usage-reconcile` con `concurrency: 1`', () => {
    expect(Reflect.getMetadata('bullmq:processor_metadata', UsageReconcileProcessor)).toEqual({
      name: 'usage-reconcile',
    });
    expect(Reflect.getMetadata('bullmq:worker_metadata', UsageReconcileProcessor)).toEqual({
      concurrency: 1,
    });
  });

  it('CA-13: lista las cuentas por páginas de `id` dentro de `ITransactionRunner.run` (sin actor)', async () => {
    const { processor, journal } = setup();

    await processor.process(job());

    expect(journal.filter((entry) => entry.startsWith('scan:'))).toEqual([
      `scan:true:null:${String(BATCH_SIZE)}`,
      `scan:true:${ACCOUNTS[1]}:${String(BATCH_SIZE)}`,
    ]);
  });

  it('CA-13: concilia cada cuenta como su dueño (`createActor(id, CLIENT)`)', async () => {
    const { processor, reconcile } = setup();

    await processor.process(job());

    expect(reconcile.mock.calls).toEqual(ACCOUNTS.map((id) => [createActor(id, Role.CLIENT)]));
  });

  it('014b CA-6: por cada cuenta, como su dueño, purga los originales vencidos a la hora del reloj y después concilia', async () => {
    const { processor, journal } = setup();

    await processor.process(job());

    expect(journal.filter((entry) => !entry.startsWith('scan:'))).toEqual(
      ACCOUNTS.flatMap((id) => [`purge:${id}:${NOW.toISOString()}`, `reconcile:${id}`]),
    );
  });

  it('014b CA-6: `quota.reconcile_run` suma los originales purgados de todas las cuentas', async () => {
    const { processor, lines } = setup({ keptPurged: 2 });

    await processor.process(job());

    expect(lines.map((line) => line.payload)).toEqual([
      { event: 'quota.reconcile_run', scanned: 3, failed: 0, keptPurged: 6 },
    ]);
  });

  it('CA-13: una página completa pide la siguiente; una vacía cierra la pasada', async () => {
    const { processor, journal } = setup({ accounts: ACCOUNTS.slice(0, BATCH_SIZE) });

    await processor.process(job());

    expect(journal.filter((entry) => entry.startsWith('scan:'))).toHaveLength(2);
  });

  it('CA-13, RNF-17: registra `quota.reconcile_run` con el `correlationId` y el `jobId`', async () => {
    const { processor, lines } = setup();

    await processor.process(job());

    expect(lines).toEqual([
      {
        level: 'info',
        correlationId: CORRELATION_ID,
        jobId: JOB_ID,
        payload: { event: 'quota.reconcile_run', scanned: 3, failed: 0, keptPurged: 0 },
      },
    ]);
  });

  it('CA-15: una cuenta con error se registra (solo UUID y nombre del error), no frena las demás y el trabajo falla al final', async () => {
    const failing = ACCOUNTS[0];
    const { processor, reconcile, lines } = setup({ failing: [failing] });

    await expect(processor.process(job())).rejects.toBeInstanceOf(UsageReconcileIncompleteError);

    expect(reconcile).toHaveBeenCalledTimes(ACCOUNTS.length);
    expect(lines.map((line) => [line.level, line.payload])).toEqual([
      ['error', { event: 'quota.reconcile_failed', userId: failing, errorName: 'Error' }],
      ['info', { event: 'quota.reconcile_run', scanned: 3, failed: 1, keptPurged: 0 }],
    ]);
  });

  it('CA-14: sin cuentas termina bien y no concilia nada', async () => {
    const { processor, reconcile } = setup({ accounts: [] });

    await expect(processor.process(job())).resolves.toBeUndefined();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('RNF-17: sin `correlationId` en el trabajo usa uno nuevo', async () => {
    const { processor, lines } = setup({ accounts: [] });

    await processor.process(job({}));

    expect(lines[0]?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
