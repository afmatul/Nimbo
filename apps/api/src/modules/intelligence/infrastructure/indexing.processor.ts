import { randomUUID } from 'node:crypto';

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import { IndexingService } from '../application/indexing.service';
import type { IntelligenceLogger } from '../application/intelligence-logger';
import type { IndexJob } from '../application/ports/i-index-queue.port';

import { INDEXING_QUEUE } from './bullmq-index.queue';

/** Datos de un trabajo `indexing`: los ids y el `correlationId` que agrega `enqueueWithCorrelation`. */
export type IndexJobData = IndexJob & { readonly correlationId?: string };

/** Una indexación a la vez (plan 019 §5): acota memoria (hasta 50 MiB por archivo, DF-37) y cuotas del proveedor. */
const WORKER_OPTIONS = { concurrency: 1 } as const;
/** Sin `attempts`, BullMQ intenta una sola vez. */
const DEFAULT_ATTEMPTS = 1;

/** Solo los ids: el resto de los datos del trabajo no entra al pipeline. */
const indexJobOf = ({ fileId, versionId, ownerId }: IndexJobData): IndexJob => ({
  fileId,
  versionId,
  ownerId,
});

const attemptsExhausted = (job: Job<IndexJobData>): boolean =>
  job.attemptsMade >= (job.opts.attempts ?? DEFAULT_ATTEMPTS);

const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/** Corre `work` con el `correlationId` del trabajo (o uno nuevo) y su `jobId`, como `PingProcessor` (RNF-17). */
function inJobContext<T>(job: Job<IndexJobData>, work: () => Promise<T>): Promise<T> {
  const store = { correlationId: job.data.correlationId ?? randomUUID(), jobId: String(job.id) };
  return CorrelationContext.run(store, work);
}

/**
 * Consumidor de la cola `indexing` en el `worker` (plan 019 §1, «Proceso»). Delega en `IndexingService`, que actúa como
 * la cuenta propietaria sin confiar en `ownerId` (CA-16) y solo lanza errores transitorios: BullMQ reintenta con espera
 * exponencial y, agotados los intentos, este procesador llama a `giveUp` para dejar `fallido` con motivo (CA-12).
 */
@Processor(INDEXING_QUEUE, WORKER_OPTIONS)
export class IndexingProcessor extends WorkerHost {
  constructor(
    @Inject(IndexingService) private readonly indexing: IndexingService,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
  ) {
    super();
  }

  process(job: Job<IndexJobData>): Promise<void> {
    return inJobContext(job, () => this.indexing.indexVersion(indexJobOf(job.data)));
  }

  /**
   * Último intento fallido → `giveUp`. BullMQ no espera a los oyentes: un fallo aquí se registra y no se propaga; la
   * fila queda `indexando` y la conciliación (RN-12) la vuelve a encolar.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<IndexJobData> | undefined, error: Error): Promise<void> {
    if (job === undefined || !attemptsExhausted(job)) return;
    const indexJob = indexJobOf(job.data);
    await inJobContext(job, async () => {
      try {
        await this.indexing.giveUp(indexJob, error);
      } catch (failure) {
        this.logger.error({
          event: 'indexing.give_up_failed',
          fileId: indexJob.fileId,
          versionId: indexJob.versionId,
          errorClass: errorClassOf(failure),
        });
      }
    });
  }
}
