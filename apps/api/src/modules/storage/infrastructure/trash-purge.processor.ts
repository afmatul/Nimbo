import { randomUUID } from 'node:crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import {
  CorrelationContext,
  createActor,
  I_CLOCK,
  I_TRANSACTION_RUNNER,
  Role,
} from '../../../shared';
import type { IClock, ITransactionRunner } from '../../../shared';
import { I_EXPIRED_TRASH_SCANNER } from '../application/ports/i-expired-trash.scanner.port';
import type {
  ExpiredTrashItem,
  IExpiredTrashScanner,
} from '../application/ports/i-expired-trash.scanner.port';
import type { StorageLogger } from '../application/storage-logger';
import { TrashPurgeIncompleteError } from '../application/trash-purger';
import { TrashService } from '../application/trash.service';

import { TRASH_PURGE_CONFIG, TRASH_PURGE_QUEUE } from './trash-purge.scheduler';
import type { TrashPurgeConfig, TrashPurgeJobData } from './trash-purge.scheduler';

/** Una purga a la vez: el lote ya está acotado y así no compite por el pool. */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/**
 * Purga de la papelera (CA-19, CA-20; plan 006 §4 y §5) en dos fases, como `UploadCleanupProcessor`. Fase 1:
 * `IExpiredTrashScanner` dentro de `ITransactionRunner.run` (sin actor; solo `(tipo, id, dueño)`). Fase 2: por raíz,
 * `TrashService.purgeExpired` como el dueño (`createActor(propietarioId, CLIENT)`), que abre su `withActor` y vuelve a
 * comprobar el vencimiento. Atiende el ciclo programado y el trabajo puntual de «Vaciar». Un fallo se registra y no
 * frena el lote; si hubo fallos, el trabajo falla al final para que BullMQ lo reintente.
 */
@Processor(TRASH_PURGE_QUEUE, WORKER_OPTIONS)
export class TrashPurgeProcessor extends WorkerHost {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_EXPIRED_TRASH_SCANNER) private readonly scanner: IExpiredTrashScanner,
    @Inject(TrashService) private readonly trash: TrashService,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(TRASH_PURGE_CONFIG) private readonly config: TrashPurgeConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {
    super();
  }

  process(job: Job<Partial<TrashPurgeJobData>>): Promise<void> {
    const store = {
      correlationId: job.data.correlationId ?? randomUUID(),
      jobId: String(job.id),
    };
    return CorrelationContext.run(store, () => this.purgeDue());
  }

  private async purgeDue(): Promise<void> {
    const now = this.clock.now();
    const expired = await this.transactions.run(() =>
      this.scanner.listExpired(now, this.config.batchSize),
    );
    let failed = 0;
    for (const item of expired) {
      if (!(await this.purgeAsOwner(item))) failed += 1;
    }
    this.logger.info({
      event: 'trash.purge_run',
      scanned: expired.length,
      purged: expired.length - failed,
      failed,
    });
    if (failed > 0) throw new TrashPurgeIncompleteError(failed);
  }

  /** `true` si la raíz quedó purgada (o ya no estaba). El error solo deja su nombre: el mensaje podría traer una clave. */
  private async purgeAsOwner(item: ExpiredTrashItem): Promise<boolean> {
    const owner = createActor(item.propietarioId, Role.CLIENT);
    try {
      await this.trash.purgeExpired(owner, { type: item.type, id: item.id });
      return true;
    } catch (error) {
      this.logger.error({
        event: 'trash.purge_item_failed',
        nodeType: item.type,
        nodeId: item.id,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return false;
    }
  }
}
