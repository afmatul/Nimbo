import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  I_CLOCK,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  InsufficientRoleError,
  RateLimitExceededError,
} from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { Action, PermissionResolver } from '../../access';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { IndexableFileGateway, NodeNotFoundError } from '../../storage';
import type { IndexableFile } from '../../storage';
import { IndexingNotRetryableError } from '../domain/errors';
import type { FileIndexing, IndexingReason, IndexingState } from '../domain/file-indexing';

import { ExtractorRegistry } from './extractor-registry';
import type { IntelligenceLogger } from './intelligence-logger';
import { I_INDEX_QUEUE } from './ports/i-index-queue.port';
import type { IIndexQueue } from './ports/i-index-queue.port';
import { I_INDEX_STATUS_NOTIFIER } from './ports/i-index-status-notifier.port';
import type { IIndexStatusNotifier } from './ports/i-index-status-notifier.port';
import { I_INDEXING_REPOSITORY } from './ports/i-indexing-repository.port';
import type { IIndexingRepository } from './ports/i-indexing-repository.port';

/** `RATE_LIMIT_INDEX_RETRY_PER_MINUTE` (plan 019 §5): «Reintentar» por usuario en una ventana de 60 s. */
export interface IndexStatusConfig {
  readonly retriesPerMinute: number;
}

export const INDEX_STATUS_CONFIG = Symbol('IndexStatusConfig');

/** Lo que el estado usa de la fachada de `storage`: solo el archivo vivo que el actor ve (CA-18). */
export type IndexStatusFiles = Pick<IndexableFileGateway, 'findAccessible'>;

/** «Reintentar» lo decide el nivel de acceso del actor sobre el archivo (`Action.EDIT`, CA-13). */
export type IndexStatusPermissions = Pick<PermissionResolver, 'can'>;

/** Estado de indexación de la versión vigente, como lo ve el actor (plan §4). `state: null`: el tipo no se indexa. */
export interface IndexStatus {
  readonly state: IndexingState | null;
  readonly reason: IndexingReason | null;
  readonly updatedAt: Date | null;
  readonly canRetry: boolean;
}

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RETRY_RATE_KEY_PREFIX = 'intelligence:index-retry:';

const NOT_INDEXED: IndexStatus = { state: null, reason: null, updatedAt: null, canRetry: false };
/** Indexable sin fila todavía (el oyente no llegó o falló; la conciliación la crea, RN-12). */
const NOT_STARTED: IndexStatus = {
  state: 'pendiente',
  reason: null,
  updatedAt: null,
  canRetry: false,
};

/**
 * Estado y «Reintentar» de la indexación de un archivo (plan 019 §2 y §4). El archivo se resuelve con
 * `IndexableFileGateway.findAccessible` (`accessibleNodes`): ajeno, en la papelera o inexistente es el mismo
 * `NodeNotFoundError` (CA-15, CA-18). «Reintentar» exige `Action.EDIT` (propietaria o editor, CA-13), pasa por el
 * límite de tasa antes de resolver el archivo (sin oráculo) y vuelve a `pendiente` con comparar y asignar desde
 * `fallido`; tras el commit encola, audita `file.index_retried` con quien lo pulsó y avisa a la propietaria.
 */
@Injectable()
export class IndexStatusService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(IndexableFileGateway) private readonly files: IndexStatusFiles,
    @Inject(I_INDEXING_REPOSITORY) private readonly indexings: IIndexingRepository,
    @Inject(PermissionResolver) private readonly permissions: IndexStatusPermissions,
    @Inject(ExtractorRegistry) private readonly extractors: ExtractorRegistry,
    @Inject(I_INDEX_QUEUE) private readonly queue: IIndexQueue,
    @Inject(I_INDEX_STATUS_NOTIFIER) private readonly notifier: IIndexStatusNotifier,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(INDEX_STATUS_CONFIG) private readonly config: IndexStatusConfig,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
  ) {}

  async get(actor: Actor, fileId: string): Promise<IndexStatus> {
    const file = await this.accessibleFile(actor, fileId);
    if (!this.extractors.supports(file.kind)) return NOT_INDEXED;
    return this.transactions.withActor(actor, () => this.statusOf(actor, file));
  }

  async retry(actor: Actor, fileId: string): Promise<void> {
    await this.assertWithinRate(actor);
    const file = await this.accessibleFile(actor, fileId);
    const retried = await this.transactions.withActor(actor, () => this.markPending(actor, file));
    await this.queue.enqueue({ fileId, versionId: retried.versionId, ownerId: file.ownerId });
    await this.recordRetried(actor, file, retried);
  }

  private async accessibleFile(actor: Actor, fileId: string): Promise<IndexableFile> {
    const file = await this.files.findAccessible(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    return file;
  }

  private async statusOf(actor: Actor, file: IndexableFile): Promise<IndexStatus> {
    const indexing = await this.indexings.findByVersion(actor, file.currentVersionId);
    if (indexing === null) return NOT_STARTED;
    const { state, reason, updatedAt } = indexing.snapshot();
    const canRetry = indexing.isRetryable && (await this.canEdit(actor, file));
    return { state, reason, updatedAt, canRetry };
  }

  /** Lector → 403; sin fila o fuera de `fallido` (también si otro reintento ganó la carrera) → 409. */
  private async markPending(actor: Actor, file: IndexableFile): Promise<FileIndexing> {
    if (!(await this.canEdit(actor, file))) throw new InsufficientRoleError();
    const indexing = await this.indexings.findByVersion(actor, file.currentVersionId);
    if (indexing === null) throw new IndexingNotRetryableError();
    const retried = indexing.retry(this.clock.now());
    const applied = await this.indexings.compareAndSet(actor, retried, 'fallido');
    if (!applied) throw new IndexingNotRetryableError();
    return retried;
  }

  private canEdit(actor: Actor, file: IndexableFile): Promise<boolean> {
    return this.permissions.can(actor, file.id, Action.EDIT);
  }

  private async assertWithinRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(RETRY_RATE_KEY_PREFIX + actor.id, [
      { limit: this.config.retriesPerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);
    if (decision.allowed) return;
    this.logger.warn({ event: 'indexing.retry_rate_limited' });
    throw new RateLimitExceededError(decision.retryAfterSeconds);
  }

  /** Auditoría con quien lo pulsó (D-6), bitácora con ids y aviso a la propietaria (CA-14). */
  private async recordRetried(
    actor: Actor,
    file: IndexableFile,
    retried: FileIndexing,
  ): Promise<void> {
    const { fileId, versionId } = retried;
    await this.audit.record({
      action: AuditAction.FILE_INDEX_RETRIED,
      actor,
      targetUserId: file.ownerId,
      resourceId: fileId,
      attributes: { versionId },
    });
    this.logger.info({ event: 'indexing.retried', fileId, versionId });
    await this.notifier.notify({ ownerId: file.ownerId, fileId, state: 'pendiente', reason: null });
  }
}
