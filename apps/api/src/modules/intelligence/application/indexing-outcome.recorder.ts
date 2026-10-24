import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { errorClassOf, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { AuditRecord, IAuditLogger } from '../../audit';
import type { FileVersionRef } from '../../storage';
import type { FileIndexing, FileIndexingSnapshot, IndexingState } from '../domain/file-indexing';

import type { IntelligenceLogger } from './intelligence-logger';
import { I_INDEX_STATUS_NOTIFIER } from './ports/i-index-status-notifier.port';
import type { IIndexStatusNotifier } from './ports/i-index-status-notifier.port';
import { I_INDEXING_REPOSITORY } from './ports/i-indexing-repository.port';
import type { IIndexingRepository } from './ports/i-indexing-repository.port';

/** Un intento sobre una versión: la cuenta propietaria con que actúa y la indexación tal como está en la BD. */
export interface IndexingRun {
  readonly owner: Actor;
  readonly indexing: FileIndexing;
}

/** Por qué un trabajo termina sin tocar nada (CA-16): la versión ya no es la vigente u otro ya la tomó o cerró. */
export type DiscardCause = 'not_current' | 'not_claimable';

type Settled = Extract<IndexingState, 'indexado' | 'no_indexable' | 'fallido'>;
type AuditAttributes = NonNullable<AuditRecord['attributes']>;

/** Por resultado: acción del catálogo de auditoría (D-6), evento y nivel de la bitácora técnica (plan §5). */
const OUTCOMES: Readonly<
  Record<Settled, { action: AuditAction; event: string; level: 'info' | 'warn' }>
> = {
  indexado: { action: AuditAction.FILE_INDEXED, event: 'indexing.completed', level: 'info' },
  no_indexable: {
    action: AuditAction.FILE_INDEX_UNINDEXABLE,
    event: 'indexing.unindexable',
    level: 'info',
  },
  fallido: { action: AuditAction.FILE_INDEX_FAILED, event: 'indexing.failed', level: 'warn' },
};

const isSettled = (state: IndexingState): state is Settled => state in OUTCOMES;

const idsOf = (indexing: FileIndexing): FileVersionRef => ({
  fileId: indexing.fileId,
  versionId: indexing.versionId,
});

/** Atributos de auditoría (lista blanca del catálogo): `indexado` con fragmentos, el resto con motivo. */
function auditAttributesOf(snapshot: FileIndexingSnapshot): AuditAttributes {
  const duration = snapshot.durationMs === null ? {} : { durationMs: snapshot.durationMs };
  const detail =
    snapshot.reason === null
      ? { fragmentCount: snapshot.fragmentCount }
      : { reason: snapshot.reason };
  return { versionId: snapshot.versionId, ...duration, ...detail };
}

/**
 * Deja constancia del resultado de cada intento de indexación (plan 019 §2, SRP frente a `IndexingService`): guarda el
 * estado final con comparar y asignar, audita (`file.indexed`, `file.index_unindexable`, `file.index_failed`), escribe
 * la bitácora técnica y avisa a la propietaria. Solo ids, estado, motivo y medidas: nunca texto, nombres de archivo,
 * extractos, vectores ni el mensaje de un error (CA-21). El `correlationId` lo agrega el `mixin` de pino desde el
 * `CorrelationContext` que abre el procesador.
 */
@Injectable()
export class IndexingOutcomeRecorder {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_INDEXING_REPOSITORY) private readonly indexings: IIndexingRepository,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_INDEX_STATUS_NOTIFIER) private readonly notifier: IIndexStatusNotifier,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
  ) {}

  started(run: IndexingRun): void {
    const attempt = run.indexing.snapshot().attempts;
    this.logger.info({ event: 'indexing.started', ...idsOf(run.indexing), attempt });
  }

  discarded(ref: FileVersionRef, cause: DiscardCause): void {
    const { fileId, versionId } = ref;
    this.logger.info({ event: 'indexing.discarded', fileId, versionId, cause });
  }

  /** Intento con un error transitorio: la cola lo reintenta (RN-6). */
  attemptFailed(run: IndexingRun, error: unknown): void {
    const attempt = run.indexing.snapshot().attempts;
    const errorClass = errorClassOf(error);
    this.logger.warn({
      event: 'indexing.attempt_failed',
      ...idsOf(run.indexing),
      attempt,
      errorClass,
    });
  }

  /**
   * Guarda `settled` solo si la BD sigue en el estado de `run` y, si lo guardó, lo anuncia. `false` si otro llegó
   * antes: no audita ni avisa (CA-9).
   */
  async settle(run: IndexingRun, settled: FileIndexing): Promise<boolean> {
    const applied = await this.transactions.withActor(run.owner, () =>
      this.indexings.compareAndSet(run.owner, settled, run.indexing.state),
    );
    if (applied) await this.announce(run.owner, settled);
    else this.discarded(idsOf(settled), 'not_claimable');
    return applied;
  }

  /** Audita, registra y avisa un estado final ya guardado (`indexado` lo guarda el reemplazo de fragmentos). */
  async announce(owner: Actor, settled: FileIndexing): Promise<void> {
    if (!isSettled(settled.state)) {
      throw new TypeError(`\`${settled.state}\` no es un resultado de indexación.`);
    }
    const outcome = OUTCOMES[settled.state];
    const snapshot = settled.snapshot();
    await this.audit.record({
      action: outcome.action,
      actor: owner,
      targetUserId: owner.id,
      resourceId: snapshot.fileId,
      attributes: auditAttributesOf(snapshot),
    });
    this.logger[outcome.level]({ event: outcome.event, ...this.logFieldsOf(snapshot) });
    await this.notify(owner, settled);
  }

  private logFieldsOf(snapshot: FileIndexingSnapshot): Record<string, unknown> {
    const { fileId, versionId, state, reason, durationMs, attempts, fragmentCount } = snapshot;
    return { fileId, versionId, state, reason, durationMs, attempt: attempts, fragmentCount };
  }

  /** De mejor esfuerzo (ADR-0030): un aviso perdido no cambia el estado guardado ni hace reintentar el trabajo. */
  private async notify(owner: Actor, settled: FileIndexing): Promise<void> {
    const { fileId, state, reason } = settled;
    try {
      await this.notifier.notify({ ownerId: owner.id, fileId, state, reason });
    } catch (error) {
      const errorClass = errorClassOf(error);
      this.logger.warn({ event: 'indexing.notify_failed', ...idsOf(settled), errorClass });
    }
  }
}
