import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import {
  attemptEach,
  createActor,
  I_CLOCK,
  I_TRANSACTION_RUNNER,
  Role,
  runWithJobCorrelation,
} from '../../../shared';
import type { Actor, CorrelatedJobData, IClock, ITransactionRunner } from '../../../shared';
import { I_CLIENT_ACCOUNT_SCANNER } from '../application/ports/i-client-account.scanner.port';
import type { IClientAccountScanner } from '../application/ports/i-client-account.scanner.port';
import type { StorageLogger } from '../application/storage-logger';
import { UsageReconcileIncompleteError, UsageReconciler } from '../application/usage-reconciler';
import { VersionPruner } from '../application/version-pruner';

import { USAGE_RECONCILE_CONFIG, USAGE_RECONCILE_QUEUE } from './usage-reconcile.scheduler';
import type { UsageReconcileConfig } from './usage-reconcile.scheduler';

/** Una conciliación a la vez: recorre todas las cuentas y así no compite por el pool. */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/** Lo que deja una pasada en `quota.reconcile_run`; `keptPurged` son los originales vencidos que borró (014b). */
interface ReconcileRunTally {
  scanned: number;
  failed: number;
  keptPurged: number;
}

/**
 * Conciliación programada de `espacio_usado` (spec 007 CA-13 a CA-15; plan §5, D-12). Por páginas de `id`:
 * `IClientAccountScanner` dentro de `ITransactionRunner.run` (sin actor; solo UUID) y, por cuenta,
 * `UsageReconciler.reconcile` como el dueño (`createActor(id, CLIENT)`), que mide bajo RLS normal. Antes de conciliar,
 * `VersionPruner.purgeExpiredOriginals` borra como el mismo dueño sus originales conservados vencidos (014b CA-6), que
 * no cuentan en el espacio. El fallo de una cuenta se registra y no frena las demás; si hubo fallos, el trabajo falla al
 * final para que BullMQ lo reintente.
 */
@Processor(USAGE_RECONCILE_QUEUE, WORKER_OPTIONS)
export class UsageReconcileProcessor extends WorkerHost {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLIENT_ACCOUNT_SCANNER) private readonly scanner: IClientAccountScanner,
    @Inject(UsageReconciler) private readonly reconciler: UsageReconciler,
    @Inject(VersionPruner) private readonly pruner: VersionPruner,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(USAGE_RECONCILE_CONFIG) private readonly config: UsageReconcileConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {
    super();
  }

  process(job: Job<Partial<CorrelatedJobData>>): Promise<void> {
    return runWithJobCorrelation(job, () => this.reconcileAll());
  }

  private async reconcileAll(): Promise<void> {
    const tally: ReconcileRunTally = { scanned: 0, failed: 0, keptPurged: 0 };
    let afterId: string | null = null;
    do {
      const ids = await this.nextPage(afterId);
      tally.failed += await this.reconcilePage(ids, tally);
      tally.scanned += ids.length;
      afterId = ids.length === this.config.batchSize ? (ids.at(-1) ?? null) : null;
    } while (afterId !== null);
    this.logger.info({ event: 'quota.reconcile_run', ...tally });
    if (tally.failed > 0) throw new UsageReconcileIncompleteError(tally.failed);
  }

  private nextPage(afterId: string | null): Promise<readonly string[]> {
    return this.transactions.run(() => this.scanner.listClientIds(afterId, this.config.batchSize));
  }

  /** Cuántas cuentas de la página fallaron; el error solo deja su nombre (el mensaje podría traer datos de la cuenta). */
  private reconcilePage(ids: readonly string[], tally: ReconcileRunTally): Promise<number> {
    return attemptEach(
      ids,
      (userId) => this.maintain(createActor(userId, Role.CLIENT), tally),
      (userId, failure) =>
        this.logger.error({
          event: 'quota.reconcile_failed',
          userId,
          errorName: failure.errorName,
        }),
    );
  }

  /** Purga los originales vencidos del dueño (nunca lanza) y después concilia su espacio. */
  private async maintain(owner: Actor, tally: ReconcileRunTally): Promise<void> {
    const purged = await this.pruner.purgeExpiredOriginals(owner, this.clock.now());
    tally.keptPurged += purged;
    await this.reconciler.reconcile(owner);
  }
}
