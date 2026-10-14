import { randomUUID } from 'node:crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import { SubscriptionReconcilerService } from '../application/subscription-reconciler.service';

import { SUBSCRIPTION_RECONCILE_QUEUE } from './subscription-reconcile.scheduler';
import type { SubscriptionReconcileJobData } from './subscription-reconcile.scheduler';

/** Una conciliación a la vez: recorre todas las cuentas y así no compite por el pool. */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/** Procesador de `subscription-reconcile` (spec 009 CA-2): solo fija la correlación y delega la pasada. */
@Processor(SUBSCRIPTION_RECONCILE_QUEUE, WORKER_OPTIONS)
export class SubscriptionReconcileProcessor extends WorkerHost {
  constructor(
    @Inject(SubscriptionReconcilerService)
    private readonly reconciler: SubscriptionReconcilerService,
  ) {
    super();
  }

  process(job: Job<Partial<SubscriptionReconcileJobData>>): Promise<void> {
    const store = {
      correlationId: job.data.correlationId ?? randomUUID(),
      jobId: String(job.id),
    };
    return CorrelationContext.run(store, () => this.reconciler.reconcileAll());
  }
}
