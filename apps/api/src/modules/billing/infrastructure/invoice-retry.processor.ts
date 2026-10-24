import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { runWithJobCorrelation } from '../../../shared';
import type { CorrelatedJobData } from '../../../shared';
import { InvoiceRetrier } from '../application/invoice-retrier';

import { INVOICE_RETRY_QUEUE } from './invoice-retry.scheduler';

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

  process(job: Job<Partial<CorrelatedJobData>>): Promise<void> {
    return runWithJobCorrelation(job, () => this.retrier.retryPending());
  }
}
