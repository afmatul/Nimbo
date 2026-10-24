import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createActor, errorClassOf, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { IndexableFileGateway } from '../../storage';
import type { IdPage, IndexableFile } from '../../storage';
import type { FileIndexing } from '../domain/file-indexing';

import { ExtractorRegistry } from './extractor-registry';
import { IndexScheduler } from './index-scheduler';
import type { IntelligenceLogger } from './intelligence-logger';
import { I_INDEX_QUEUE } from './ports/i-index-queue.port';
import type { IIndexQueue, IndexJob } from './ports/i-index-queue.port';
import { I_INDEXING_REPOSITORY } from './ports/i-indexing-repository.port';
import type { IIndexingRepository } from './ports/i-indexing-repository.port';
import { ReconcileTally } from './reconcile-tally';
import type { Repair } from './reconcile-tally';

const MINUTE_MS = 60_000;
/** Una fila que espera al `worker` sin cambios durante este lapso se da por perdida y se vuelve a encolar (plan 019 §1). */
export const STALE_AFTER_MS = 30 * MINUTE_MS;

/** Conciliación de la indexación (`INDEX_RECONCILE_INTERVAL_MINUTES`, `INDEX_RECONCILE_BATCH_SIZE`). */
export interface IndexReconcileConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const INDEX_RECONCILE_CONFIG = Symbol('IndexReconcileConfig');

/** Lo que la conciliación usa de la fachada de `storage`: cuentas (solo UUID) y archivos de cada una como ella. */
export type ReconcileFiles = Pick<IndexableFileGateway, 'clientIds' | 'listIndexable'>;

/** Quedaron cuentas sin conciliar: el trabajo falla para que BullMQ lo reintente. Sin ids. */
export class IndexReconcileIncompleteError extends Error {
  constructor(readonly failed: number) {
    super(
      `La conciliación de la indexación dejó ${String(failed)} cuenta(s) sin revisar; se reintentará.`,
    );
    this.name = 'IndexReconcileIncompleteError';
  }
}

/** La cuenta que se concilia y dónde se anota lo hecho. */
interface AccountRun {
  readonly owner: Actor;
  readonly tally: ReconcileTally;
}

interface PagedSource<T> {
  fetch(page: IdPage): Promise<readonly T[]>;
  idOf(item: T): string;
}

/** Recorre `source` por páginas de `limit` por id ascendente y entrega cada una a `visit`, sin juntarlas. */
async function forEachPage<T>(
  source: PagedSource<T>,
  limit: number,
  visit: (items: readonly T[]) => Promise<void>,
): Promise<void> {
  let afterId: string | null = null;
  do {
    const items = await source.fetch({ afterId, limit });
    await visit(items);
    const last = items.at(-1);
    afterId = items.length === limit && last !== undefined ? source.idOf(last) : null;
  } while (afterId !== null);
}

const jobOf = (owner: Actor, file: IndexableFile): IndexJob => ({
  fileId: file.id,
  versionId: file.currentVersionId,
  ownerId: owner.id,
});

/**
 * Conciliación de la indexación (plan 019 §1, RN-12, CA-23): recorre las cuentas de cliente (`clientIds`, solo UUID) y,
 * como cada una (`createActor(id, CLIENT)`), sus archivos por páginas de `INDEX_RECONCILE_BATCH_SIZE`. Una versión
 * vigente indexable sin fila (archivo previo a 019 o evento perdido) pasa por `IndexScheduler.schedule`; una
 * `pendiente`/`indexando` sin cambios desde hace más de 30 min se vuelve a encolar. Idempotente: el `jobId` es la
 * versión y la fila es única (CA-9). El fallo de una cuenta se registra y no frena a las demás.
 */
@Injectable()
export class IndexReconciler {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(IndexableFileGateway) private readonly files: ReconcileFiles,
    @Inject(I_INDEXING_REPOSITORY) private readonly indexings: IIndexingRepository,
    @Inject(IndexScheduler) private readonly scheduler: IndexScheduler,
    @Inject(ExtractorRegistry) private readonly extractors: ExtractorRegistry,
    @Inject(I_INDEX_QUEUE) private readonly queue: IIndexQueue,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(INDEX_RECONCILE_CONFIG) private readonly config: IndexReconcileConfig,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
  ) {}

  async reconcileAll(): Promise<void> {
    const tally = new ReconcileTally();
    await forEachPage(
      { fetch: (page) => this.files.clientIds(page), idOf: (id) => id },
      this.config.batchSize,
      (ids) => this.reconcileAccounts(ids, tally),
    );
    this.logger.info({ event: 'index.reconcile_completed', ...tally.toLog() });
    if (tally.failedAccounts > 0) throw new IndexReconcileIncompleteError(tally.failedAccounts);
  }

  private async reconcileAccounts(ids: readonly string[], tally: ReconcileTally): Promise<void> {
    for (const ownerId of ids) {
      tally.accountVisited();
      await this.reconcileAccount(ownerId, tally);
    }
  }

  /** Si la cuenta falla, se anota y se sigue. El error solo deja su clase: el mensaje podría traer datos. */
  private async reconcileAccount(ownerId: string, tally: ReconcileTally): Promise<void> {
    const owner = createActor(ownerId, Role.CLIENT);
    try {
      await forEachPage(
        { fetch: (page) => this.files.listIndexable(owner, page), idOf: (file) => file.id },
        this.config.batchSize,
        (files) => this.reconcileFiles({ owner, tally }, files),
      );
    } catch (error) {
      this.logger.error({
        event: 'index.reconcile_account_failed',
        ownerId,
        errorClass: errorClassOf(error),
      });
      tally.accountFailed(ownerId);
    }
  }

  private async reconcileFiles(run: AccountRun, page: readonly IndexableFile[]): Promise<void> {
    const { owner, tally } = run;
    const indexable = page.filter((file) => this.extractors.supports(file.kind));
    const repairs = await this.transactions.withActor(owner, () => this.diagnose(owner, indexable));
    for (const [index, file] of indexable.entries()) {
      const repair = repairs[index] ?? 'none';
      await this.apply(owner, file, repair);
      tally.fileReconciled(file.currentVersionId, repair);
    }
  }

  /** Qué necesita cada versión vigente, leído en una sola transacción de la cuenta. */
  private async diagnose(owner: Actor, files: readonly IndexableFile[]): Promise<Repair[]> {
    const repairs: Repair[] = [];
    for (const file of files) {
      const indexing = await this.indexings.findByVersion(owner, file.currentVersionId);
      repairs.push(this.repairFor(indexing));
    }
    return repairs;
  }

  private repairFor(indexing: FileIndexing | null): Repair {
    if (indexing === null) return 'scheduled';
    if (!indexing.isAwaitingWorker) return 'none';
    const idleMs = this.clock.now().getTime() - indexing.snapshot().updatedAt.getTime();
    return idleMs > STALE_AFTER_MS ? 'requeued' : 'none';
  }

  private async apply(owner: Actor, file: IndexableFile, repair: Repair): Promise<void> {
    if (repair === 'scheduled') {
      await this.scheduler.schedule({ ...jobOf(owner, file), kind: file.kind });
    } else if (repair === 'requeued') {
      await this.queue.enqueue(jobOf(owner, file));
    }
  }
}
