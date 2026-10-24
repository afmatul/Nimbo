import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createActor, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
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

/** Qué hizo la conciliación con una versión vigente indexable. */
type Repair = 'scheduled' | 'requeued' | 'none';

interface Repaired {
  readonly versionId: string;
  readonly repair: Repair;
}

/** Resultado de una cuenta: lo reparado, o `null` si falló. */
interface AccountResult {
  readonly ownerId: string;
  readonly repaired: readonly Repaired[] | null;
}

interface PagedSource<T> {
  fetch(page: IdPage): Promise<readonly T[]>;
  idOf(item: T): string;
}

/** Recorre `source` por páginas de `limit` por id ascendente y junta lo que devuelve `visit` en cada una. */
async function collectPages<T, R>(
  source: PagedSource<T>,
  limit: number,
  visit: (items: readonly T[]) => Promise<readonly R[]>,
): Promise<R[]> {
  const results: R[] = [];
  let afterId: string | null = null;
  do {
    const items = await source.fetch({ afterId, limit });
    results.push(...(await visit(items)));
    const last = items.at(-1);
    afterId = items.length === limit && last !== undefined ? source.idOf(last) : null;
  } while (afterId !== null);
  return results;
}

const jobOf = (owner: Actor, file: IndexableFile): IndexJob => ({
  fileId: file.id,
  versionId: file.currentVersionId,
  ownerId: owner.id,
});

const versionIdsOf = (repaired: readonly Repaired[], repair: Repair): string[] =>
  repaired.filter((item) => item.repair === repair).map((item) => item.versionId);

const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

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
    const accounts = await collectPages(
      { fetch: (page) => this.files.clientIds(page), idOf: (id) => id },
      this.config.batchSize,
      (ids) => this.reconcileAccounts(ids),
    );
    const failed = this.logCompleted(accounts);
    if (failed > 0) throw new IndexReconcileIncompleteError(failed);
  }

  private async reconcileAccounts(ids: readonly string[]): Promise<AccountResult[]> {
    const results: AccountResult[] = [];
    for (const ownerId of ids) {
      results.push({ ownerId, repaired: await this.reconcileAccount(ownerId) });
    }
    return results;
  }

  /** Lo reparado en la cuenta; `null` si falló. El error solo deja su clase: el mensaje podría traer datos. */
  private async reconcileAccount(ownerId: string): Promise<Repaired[] | null> {
    const owner = createActor(ownerId, Role.CLIENT);
    try {
      return await collectPages(
        { fetch: (page) => this.files.listIndexable(owner, page), idOf: (file) => file.id },
        this.config.batchSize,
        (files) => this.reconcileFiles(owner, files),
      );
    } catch (error) {
      this.logger.error({
        event: 'index.reconcile_account_failed',
        ownerId,
        errorClass: errorClassOf(error),
      });
      return null;
    }
  }

  private async reconcileFiles(owner: Actor, page: readonly IndexableFile[]): Promise<Repaired[]> {
    const indexable = page.filter((file) => this.extractors.supports(file.kind));
    const repairs = await this.transactions.withActor(owner, () => this.diagnose(owner, indexable));
    const repaired: Repaired[] = [];
    for (const [index, file] of indexable.entries()) {
      const repair = repairs[index] ?? 'none';
      await this.apply(owner, file, repair);
      repaired.push({ versionId: file.currentVersionId, repair });
    }
    return repaired;
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

  /** `index.reconcile_completed`: conteos e ids de versión y de cuenta, sin nombres ni texto. Devuelve las fallidas. */
  private logCompleted(accounts: readonly AccountResult[]): number {
    const failedAccountIds = accounts.filter((a) => a.repaired === null).map((a) => a.ownerId);
    const repaired = accounts.flatMap((account) => account.repaired ?? []);
    const scheduledVersionIds = versionIdsOf(repaired, 'scheduled');
    const requeuedVersionIds = versionIdsOf(repaired, 'requeued');
    this.logger.info({
      event: 'index.reconcile_completed',
      accounts: accounts.length,
      failedAccounts: failedAccountIds.length,
      files: repaired.length,
      scheduled: scheduledVersionIds.length,
      requeued: requeuedVersionIds.length,
      scheduledVersionIds,
      requeuedVersionIds,
      failedAccountIds,
    });
    return failedAccountIds.length;
  }
}
