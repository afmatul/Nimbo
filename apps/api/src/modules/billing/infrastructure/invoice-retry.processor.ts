import { randomUUID } from 'node:crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import { InvoiceRetrier } from '../application/invoice-retrier';

import { INVOICE_RETRY_QUEUE } from './invoice-retry.scheduler';
import type { InvoiceRetryJobData } from './invoice-retry.scheduler';

/** Un reintento a la vez: el lote no se reparte entre trabajos simultáneos. */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/** Procesador de `invoice-retry` (spec 009 CA-6, T-07): solo fija la correlación y delega la pasada. */
@Processor(INVOICE_RETRY_QUEUE, WORKER_OPTIONS)
export class InvoiceRetryProcessor extends WorkerHost {
  constructor(
    @Inject(InvoiceRetrier)
    private readonly retrier: InvoiceRetrier,
  ) {
    super();
  }

  process(job: Job<Partial<InvoiceRetryJobData>>): Promise<void> {
    const store = {
      correlationId: job.data.correlationId ?? randomUUID(),
      jobId: String(job.id),
    };
    return CorrelationContext.run(store, () => this.retrier.retryPending());
  }
}
