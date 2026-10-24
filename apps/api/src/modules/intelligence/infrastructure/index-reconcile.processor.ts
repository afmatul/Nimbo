import { randomUUID } from 'node:crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import { IndexReconciler } from '../application/index-reconciler';

import { INDEX_RECONCILE_QUEUE } from './index-reconcile.scheduler';
import type { IndexReconcileJobData } from './index-reconcile.scheduler';

/** Una conciliación a la vez: recorre todas las cuentas y así no compite por el pool. */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/**
 * Consumidor de `index-reconcile` en el `worker` (plan 019 §2, RN-12): abre el contexto de correlación del trabajo y
 * delega en `IndexReconciler`, que actúa como cada cuenta. Si quedaron cuentas sin revisar, el error sube y BullMQ
 * reintenta.
 */
@Processor(INDEX_RECONCILE_QUEUE, WORKER_OPTIONS)
export class IndexReconcileProcessor extends WorkerHost {
  constructor(@Inject(IndexReconciler) private readonly reconciler: IndexReconciler) {
    super();
  }

  process(job: Job<Partial<IndexReconcileJobData>>): Promise<void> {
    const store = { correlationId: job.data.correlationId ?? randomUUID(), jobId: String(job.id) };
    return CorrelationContext.run(store, () => this.reconciler.reconcileAll());
  }
}
