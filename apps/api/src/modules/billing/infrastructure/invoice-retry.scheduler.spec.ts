import type { Queue } from 'bullmq';

import { CorrelationContext, REPEATABLE_JOB_OPTIONS } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';

import {
  INVOICE_RETRY_JOB_NAME,
  INVOICE_RETRY_SCHEDULER_ID,
  InvoiceRetryScheduler,
} from './invoice-retry.scheduler';

const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const MINUTE_MS = 60_000;

describe('InvoiceRetryScheduler (spec 009 CA-6, T-07)', () => {
  it('CA-6: al arrancar registra el programa repetible cada `INVOICE_RETRY_INTERVAL_MINUTES` con `{ correlationId }`', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const queue = { upsertJobScheduler } as unknown as Queue;
    const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
    const scheduler = new InvoiceRetryScheduler(
      queue,
      { intervalMinutes: 1, batchSize: 100 },
      logger,
    );

    await CorrelationContext.run({ correlationId: CORRELATION_ID }, () =>
      scheduler.onApplicationBootstrap(),
    );

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      INVOICE_RETRY_SCHEDULER_ID,
      { every: 1 * MINUTE_MS },
      {
        name: INVOICE_RETRY_JOB_NAME,
        data: { correlationId: CORRELATION_ID },
        opts: REPEATABLE_JOB_OPTIONS,
      },
    );
  });

  it('CA-6: cada pasada tiene 3 intentos con espera exponencial', () => {
    expect(REPEATABLE_JOB_OPTIONS).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential' },
    });
  });
});
