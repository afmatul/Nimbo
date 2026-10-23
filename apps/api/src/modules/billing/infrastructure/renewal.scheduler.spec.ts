import type { Queue } from 'bullmq';

import { CorrelationContext, REPEATABLE_JOB_OPTIONS } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';

import {
  RenewalScheduler,
  SUBSCRIPTION_RENEWAL_JOB_NAME,
  SUBSCRIPTION_RENEWAL_SCHEDULER_ID,
} from './renewal.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';

describe('RenewalScheduler (spec 010 plan §2)', () => {
  it('registra la pasada cada `SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES` con un solo programa', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
    const scheduler = new RenewalScheduler(
      { upsertJobScheduler } as unknown as Queue,
      { intervalMinutes: 15, batchSize: 100 },
      logger,
    );

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduler.onApplicationBootstrap(),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      SUBSCRIPTION_RENEWAL_SCHEDULER_ID,
      { every: 15 * 60_000 },
      {
        name: SUBSCRIPTION_RENEWAL_JOB_NAME,
        data: { correlationId: CORRELATION_ID },
        opts: REPEATABLE_JOB_OPTIONS,
      },
    );
  });
});
