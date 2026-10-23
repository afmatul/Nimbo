import type { Queue } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { IntelligenceLogger } from '../application/intelligence-logger';

import {
  INDEX_RECONCILE_JOB_NAME,
  INDEX_RECONCILE_JOB_OPTIONS,
  INDEX_RECONCILE_QUEUE,
  INDEX_RECONCILE_SCHEDULER_ID,
  IndexReconcileScheduler,
  requestIndexReconcile,
} from './index-reconcile.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const MINUTE_MS = 60_000;

const setup = (intervalMinutes = 1440) => {
  const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
  const add = jest.fn().mockResolvedValue(undefined);
  const queue = { upsertJobScheduler, add } as unknown as Queue;
  const info = jest.fn();
  const logger: IntelligenceLogger = { info, warn: jest.fn(), error: jest.fn() };
  const scheduler = new IndexReconcileScheduler(queue, { intervalMinutes, batchSize: 100 }, logger);
  return { scheduler, queue, upsertJobScheduler, add, info };
};

describe('IndexReconcileScheduler (019 plan §2, RN-12)', () => {
  it('CA-23: la cola se llama `index-reconcile`', () => {
    expect(INDEX_RECONCILE_QUEUE).toBe('index-reconcile');
  });

  it('CA-23: al arrancar registra el programa repetible cada `INDEX_RECONCILE_INTERVAL_MINUTES` con `{ correlationId }`', async () => {
    const { scheduler, upsertJobScheduler, info } = setup(30);

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduler.onApplicationBootstrap(),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      INDEX_RECONCILE_SCHEDULER_ID,
      { every: 30 * MINUTE_MS },
      {
        name: INDEX_RECONCILE_JOB_NAME,
        data: { correlationId: CORRELATION_ID },
        opts: INDEX_RECONCILE_JOB_OPTIONS,
      },
    );
    expect(info).toHaveBeenCalledWith({ event: 'index.reconcile_scheduled', intervalMinutes: 30 });
  });

  it('RN-12: `requestIndexReconcile` lanza el mismo trabajo una vez, con las mismas opciones', async () => {
    const { queue, add } = setup();

    await requestIndexReconcile(queue, CORRELATION_ID);

    expect(add).toHaveBeenCalledWith(
      INDEX_RECONCILE_JOB_NAME,
      { correlationId: CORRELATION_ID },
      INDEX_RECONCILE_JOB_OPTIONS,
    );
  });
});
