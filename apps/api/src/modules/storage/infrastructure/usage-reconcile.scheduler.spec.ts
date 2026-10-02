import type { Queue } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

import {
  USAGE_RECONCILE_JOB_NAME,
  USAGE_RECONCILE_JOB_OPTIONS,
  USAGE_RECONCILE_QUEUE,
  USAGE_RECONCILE_SCHEDULER_ID,
  UsageReconcileScheduler,
} from './usage-reconcile.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const MINUTE_MS = 60_000;

const setup = (intervalMinutes = 1440) => {
  const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
  const queue = { upsertJobScheduler } as unknown as Queue;
  const info = jest.fn();
  const logger: StorageLogger = { info, warn: jest.fn(), error: jest.fn() };
  const scheduler = new UsageReconcileScheduler(queue, { intervalMinutes, batchSize: 100 }, logger);
  return { scheduler, upsertJobScheduler, info };
};

describe('UsageReconcileScheduler (spec 007 CA-13, CA-15; plan §4)', () => {
  it('CA-13: la cola se llama `usage-reconcile`', () => {
    expect(USAGE_RECONCILE_QUEUE).toBe('usage-reconcile');
  });

  it('CA-13: al arrancar registra el programa repetible cada `USAGE_RECONCILE_INTERVAL_MINUTES` con `{ correlationId }`', async () => {
    const { scheduler, upsertJobScheduler } = setup(30);

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduler.onApplicationBootstrap(),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      USAGE_RECONCILE_SCHEDULER_ID,
      { every: 30 * MINUTE_MS },
      {
        name: USAGE_RECONCILE_JOB_NAME,
        data: { correlationId: CORRELATION_ID },
        opts: USAGE_RECONCILE_JOB_OPTIONS,
      },
    );
  });

  it('CA-15: cada ejecución tiene 3 intentos con espera exponencial', () => {
    expect(USAGE_RECONCILE_JOB_OPTIONS).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential' },
    });
  });

  it('CA-13: `upsert` con id fijo: varias instancias del `worker` comparten un solo programa', async () => {
    const first = setup();
    const second = setup();

    await first.scheduler.onApplicationBootstrap();
    await second.scheduler.onApplicationBootstrap();

    expect(first.upsertJobScheduler.mock.calls[0]?.[0]).toBe(
      second.upsertJobScheduler.mock.calls[0]?.[0],
    );
  });

  it('CA-13: registra `quota.reconcile_scheduled` con el intervalo', async () => {
    const { scheduler, info } = setup();

    await scheduler.onApplicationBootstrap();

    expect(info).toHaveBeenCalledWith({
      event: 'quota.reconcile_scheduled',
      intervalMinutes: 1440,
    });
  });
});
