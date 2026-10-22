import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';

import { enqueueWithCorrelation } from '../../../shared';
import type { IIndexQueue, IndexJob } from '../application/ports/i-index-queue.port';

/** Cola de indexación (`architecture.md` §7.3): la llenan el `api` y la conciliación; la consume el `worker`. */
export const INDEXING_QUEUE = 'indexing';
export const INDEXING_JOB = 'index-version';
/** Primera espera antes de reintentar; después crece exponencialmente (plan 019 §1, «Fallos»). */
const INDEXING_BACKOFF_MS = 2_000;

/** Intentos por trabajo (`INDEXING_MAX_ATTEMPTS`, RN-6): el mismo valor en el `api` y en el `worker`. */
export interface IndexQueueConfig {
  readonly maxAttempts: number;
}

export const INDEX_QUEUE_CONFIG = Symbol('IndexQueueConfig');

/**
 * Un trabajo por versión (`jobId` = `version_archivo_id`, CA-9). `removeOnComplete/Fail` lo borran al terminar: así
 * «Reintentar» puede volver a encolar la misma versión sin que BullMQ lo ignore por un `jobId` viejo (plan §7 punto 8).
 */
const jobOptionsFor = (job: IndexJob, config: IndexQueueConfig): JobsOptions => ({
  jobId: job.versionId,
  attempts: config.maxAttempts,
  backoff: { type: 'exponential', delay: INDEXING_BACKOFF_MS },
  removeOnComplete: true,
  removeOnFail: true,
});

/** `IIndexQueue` sobre BullMQ, con el `correlationId` de la petición o del trabajo que encola. */
@Injectable()
export class BullmqIndexQueue implements IIndexQueue {
  constructor(
    @InjectQueue(INDEXING_QUEUE) private readonly queue: Queue,
    @Inject(INDEX_QUEUE_CONFIG) private readonly config: IndexQueueConfig,
  ) {}

  async enqueue(job: IndexJob): Promise<void> {
    const data = { fileId: job.fileId, versionId: job.versionId, ownerId: job.ownerId };
    await enqueueWithCorrelation(this.queue, INDEXING_JOB, data, jobOptionsFor(job, this.config));
  }
}
