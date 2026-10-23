import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import type { CorrelatedJobData, IClock, ITransactionRunner } from '../../../shared';
import {
  attemptEach,
  createActor,
  I_CLOCK,
  I_TRANSACTION_RUNNER,
  Role,
  runWithJobCorrelation,
  IncompleteBatchError,
} from '../../../shared';
import { I_EXPIRED_UPLOAD_SCANNER } from '../application/ports/i-expired-upload.scanner.port';
import type { IExpiredUploadScanner } from '../application/ports/i-expired-upload.scanner.port';
import type { StorageLogger } from '../application/storage-logger';
import { UploadService } from '../application/upload.service';

import { UPLOAD_CLEANUP_CONFIG, UPLOAD_CLEANUP_QUEUE } from './upload-cleanup.scheduler';
import type { UploadCleanupConfig } from './upload-cleanup.scheduler';

/** Un barrido a la vez (plan cambio 14): el lote ya está acotado y así no compite por el pool. */
const WORKER_OPTIONS = { concurrency: 1 } as const;

/** El barrido terminó con filas sin vencer: el trabajo falla para que BullMQ lo reintente (ADR-0021). */
export class UploadCleanupIncompleteError extends IncompleteBatchError {
  constructor(failed: number) {
    super(
      failed,
      `El barrido de cargas vencidas dejó ${String(failed)} sin limpiar; se reintentará.`,
    );
  }
}

/**
 * Barrido de cargas vencidas (CA-9, D-6, ADR-0021) en dos fases. Fase 1: `IExpiredUploadScanner` dentro de
 * `ITransactionRunner.run` (sin actor; solo `(id, propietarioId)`). Fase 2: por fila, `UploadService.expire` como el
 * dueño (`createActor(propietarioId, CLIENT)`); `expire` abre su propio `withActor`, confirma el compare-and-set y
 * borra lo subido después, sin retener la transacción durante las llamadas a MinIO. Un fallo de fila se registra y
 * no frena el lote; si hubo fallos, el trabajo falla al final para activar los reintentos.
 */
@Processor(UPLOAD_CLEANUP_QUEUE, WORKER_OPTIONS)
export class UploadCleanupProcessor extends WorkerHost {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_EXPIRED_UPLOAD_SCANNER) private readonly scanner: IExpiredUploadScanner,
    private readonly uploads: UploadService,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(UPLOAD_CLEANUP_CONFIG) private readonly config: UploadCleanupConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {
    super();
  }

  process(job: Job<Partial<CorrelatedJobData>>): Promise<void> {
    return runWithJobCorrelation(job, () => this.sweep());
  }

  private async sweep(): Promise<void> {
    const now = this.clock.now();
    const expired = await this.transactions.run(() =>
      this.scanner.listExpiredIds(now, this.config.batchSize),
    );
    const failed = await attemptEach(
      expired,
      (upload) => this.uploads.expire(createActor(upload.propietarioId, Role.CLIENT), upload.id),
      (upload, failure) =>
        this.logger.error({
          event: 'upload.cleanup_failed',
          cargaId: upload.id,
          errorName: failure.errorName,
        }),
    );
    this.logger.info({
      event: 'upload.cleanup_run',
      scanned: expired.length,
      expired: expired.length - failed,
      failed,
    });
    if (failed > 0) throw new UploadCleanupIncompleteError(failed);
  }
}
