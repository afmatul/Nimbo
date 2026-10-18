import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import {
  attemptEach,
  createActor,
  I_TRANSACTION_RUNNER,
  Role,
  runWithJobCorrelation,
} from '../../../shared';
import type { CorrelatedJobData, ITransactionRunner } from '../../../shared';
import { I_CLIENT_ACCOUNT_SCANNER } from '../application/ports/i-client-account.scanner.port';
import type { IClientAccountScanner } from '../application/ports/i-client-account.scanner.port';
import type { StorageLogger } from '../application/storage-logger';
import { UsageReconcileIncompleteError, UsageReconciler } from '../application/usage-reconciler';

import { USAGE_RECONCILE_CONFIG, USAGE_RECONCILE_QUEUE } from './usage-reconcile.scheduler';
import type { UsageReconcileConfig } from './usage-reconcile.scheduler';

/** Una conciliación a la vez: recorre todas las cuentas y así no compite por el pool. */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/**
 * Conciliación programada de `espacio_usado` (spec 007 CA-13 a CA-15; plan §5, D-12). Por páginas de `id`:
 * `IClientAccountScanner` dentro de `ITransactionRunner.run` (sin actor; solo UUID) y, por cuenta,
 * `UsageReconciler.reconcile` como el dueño (`createActor(id, CLIENT)`), que mide bajo RLS normal. El fallo de una
 * cuenta se registra y no frena las demás; si hubo fallos, el trabajo falla al final para que BullMQ lo reintente.
 */
@Processor(USAGE_RECONCILE_QUEUE, WORKER_OPTIONS)
export class UsageReconcileProcessor extends WorkerHost {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLIENT_ACCOUNT_SCANNER) private readonly scanner: IClientAccountScanner,
    @Inject(UsageReconciler) private readonly reconciler: UsageReconciler,
    @Inject(USAGE_RECONCILE_CONFIG) private readonly config: UsageReconcileConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {
    super();
  }

  process(job: Job<Partial<CorrelatedJobData>>): Promise<void> {
    return runWithJobCorrelation(job, () => this.reconcileAll());
  }

  private async reconcileAll(): Promise<void> {
    let scanned = 0;
    let failed = 0;
    let afterId: string | null = null;
    do {
      const ids = await this.nextPage(afterId);
      failed += await this.reconcilePage(ids);
      scanned += ids.length;
      afterId = ids.length === this.config.batchSize ? (ids.at(-1) ?? null) : null;
    } while (afterId !== null);
    this.logger.info({ event: 'quota.reconcile_run', scanned, failed });
    if (failed > 0) throw new UsageReconcileIncompleteError(failed);
  }

  private nextPage(afterId: string | null): Promise<readonly string[]> {
    return this.transactions.run(() => this.scanner.listClientIds(afterId, this.config.batchSize));
  }

  /** Cuántas cuentas de la página fallaron; el error solo deja su nombre (el mensaje podría traer datos de la cuenta). */
  private reconcilePage(ids: readonly string[]): Promise<number> {
    return attemptEach(
      ids,
      (userId) => this.reconciler.reconcile(createActor(userId, Role.CLIENT)),
      (userId, failure) =>
        this.logger.error({ event: 'quota.reconcile_failed', userId, errorName: failure }),
    );
  }
}
