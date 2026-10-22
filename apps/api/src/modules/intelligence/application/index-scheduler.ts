import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { createActor, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import type { FileVersionCreatedEvent } from '../../storage';
import { FileIndexing } from '../domain/file-indexing';
import type { IndexingState } from '../domain/file-indexing';

import { ExtractorRegistry } from './extractor-registry';
import { I_INDEX_QUEUE } from './ports/i-index-queue.port';
import type { IIndexQueue } from './ports/i-index-queue.port';
import { I_INDEX_STATUS_NOTIFIER } from './ports/i-index-status-notifier.port';
import type { IIndexStatusNotifier } from './ports/i-index-status-notifier.port';
import { I_INDEXING_REPOSITORY } from './ports/i-indexing-repository.port';
import type { IIndexingRepository } from './ports/i-indexing-repository.port';

/** Estados en que la versión todavía espera al `worker`: encolarla otra vez no duplica nada (`jobId` = versión). */
const AWAITING_WORKER: readonly IndexingState[] = ['pendiente', 'indexando'];

/** Qué dejó la transacción: fila nueva, una que todavía espera al `worker` o una ya terminada. */
type Pending = 'created' | 'awaiting' | 'settled';

/**
 * Programa la indexación de una versión vigente (plan 019 §2, RN-11): si `ExtractorRegistry` soporta su tipo, la deja
 * `pendiente` (una fila por versión, CA-9), encola el trabajo y avisa a la propietaria. Actúa como la cuenta
 * propietaria del archivo (`createActor(ownerId, CLIENT)`) y no es una acción del cliente: una cuenta en solo lectura
 * se indexa igual (CA-22). Lo usan el oyente del evento y la conciliación (T-08); un error sube al llamador, con la
 * fila ya confirmada para que la conciliación la recoja (RN-12).
 */
@Injectable()
export class IndexScheduler {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_INDEXING_REPOSITORY) private readonly indexings: IIndexingRepository,
    @Inject(ExtractorRegistry) private readonly extractors: ExtractorRegistry,
    @Inject(I_INDEX_QUEUE) private readonly queue: IIndexQueue,
    @Inject(I_INDEX_STATUS_NOTIFIER) private readonly notifier: IIndexStatusNotifier,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async schedule(version: FileVersionCreatedEvent): Promise<void> {
    if (!this.extractors.supports(version.kind)) return;
    const { fileId, versionId, ownerId } = version;
    const owner = createActor(ownerId, Role.CLIENT);
    const pending = await this.transactions.withActor(owner, () =>
      this.ensurePending(owner, version),
    );
    if (pending === 'settled') return;
    await this.queue.enqueue({ fileId, versionId, ownerId });
    if (pending === 'created') {
      await this.notifier.notify({ ownerId, fileId, state: 'pendiente', reason: null });
    }
  }

  /** Inserta la fila `pendiente` si la versión no tiene otra (`ON CONFLICT`); si la tiene, dice en qué quedó. */
  private async ensurePending(owner: Actor, version: FileVersionCreatedEvent): Promise<Pending> {
    const indexing = FileIndexing.pending({
      id: randomUUID(),
      fileId: version.fileId,
      versionId: version.versionId,
      now: this.clock.now(),
    });
    if (await this.indexings.insertIfAbsent(owner, indexing)) return 'created';
    const existing = await this.indexings.findByVersion(owner, version.versionId);
    return existing !== null && AWAITING_WORKER.includes(existing.state) ? 'awaiting' : 'settled';
  }
}
