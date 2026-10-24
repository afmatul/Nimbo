import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { runWithJobCorrelation } from '../../../shared';
import type { CorrelatedJobData } from '../../../shared';
import { RenewalRunner } from '../application/renewal-runner';

import { SUBSCRIPTION_RENEWAL_QUEUE } from './renewal.scheduler';

/** Una pasada a la vez: dos pasadas simultáneas no se reparten el lote (el candado igual evita un doble cobro, CA-3). */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/** Procesador de `subscription-renewal` (spec 010 CA-1 a CA-5): solo fija la correlación y delega la pasada. */
@Processor(SUBSCRIPTION_RENEWAL_QUEUE, WORKER_OPTIONS)
export class RenewalProcessor extends WorkerHost {
  constructor(@Inject(RenewalRunner) private readonly runner: RenewalRunner) {
    super();
  }

  process(job: Job<Partial<CorrelatedJobData>>): Promise<void> {
    return runWithJobCorrelation(job, () => this.runner.runOnce());
  }
}
