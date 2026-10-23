import type { Queue } from 'bullmq';

import { CorrelationContext, REPEATABLE_JOB_OPTIONS } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';

import {
  SUBSCRIPTION_RECONCILE_JOB_NAME,
  SUBSCRIPTION_RECONCILE_SCHEDULER_ID,
  SubscriptionReconcileScheduler,
} from './subscription-reconcile.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const MINUTE_MS = 60_000;

describe('SubscriptionReconcileScheduler (spec 009 CA-2)', () => {
  it('CA-2: al arrancar registra el programa repetible cada `SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES` con `{ correlationId }`', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const queue = { upsertJobScheduler } as unknown as Queue;
    const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
    const scheduler = new SubscriptionReconcileScheduler(
      queue,
      { intervalMinutes: 60, batchSize: 100 },
      logger,
    );

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduler.onApplicationBootstrap(),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      SUBSCRIPTION_RECONCILE_SCHEDULER_ID,
      { every: 60 * MINUTE_MS },
      {
        name: SUBSCRIPTION_RECONCILE_JOB_NAME,
        data: { correlationId: CORRELATION_ID },
        opts: REPEATABLE_JOB_OPTIONS,
      },
    );
  });

  it('CA-2: cada pasada tiene 3 intentos con espera exponencial', () => {
    expect(REPEATABLE_JOB_OPTIONS).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential' },
    });
  });
});
