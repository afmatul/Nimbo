import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';

import { enqueueWithCorrelation } from '../../../shared';
import type { IIndexQueue, IndexRequest } from '../application/ports/i-index-queue.port';

/** Cola de indexación (`architecture.md` §7.3 y tabla de colas): la consume M6 desde 019. */
export const INDEX_QUEUE = 'indexing';
const INDEX_JOB = 'index-version';
const INDEX_ATTEMPTS = 3;
const INDEX_BACKOFF_MS = 2_000;

/** Un trabajo por versión (`jobId` = `version_archivo_id`), tres intentos con espera exponencial. */
const jobOptionsFor = (request: IndexRequest): JobsOptions => ({
  jobId: request.versionId,
  attempts: INDEX_ATTEMPTS,
  backoff: { type: 'exponential', delay: INDEX_BACKOFF_MS },
});

/** `IIndexQueue` sobre BullMQ. Sin consumidor hasta 019: el trabajo espera en Redis (CA-12). */
@Injectable()
export class IndexQueue implements IIndexQueue {
  constructor(@InjectQueue(INDEX_QUEUE) private readonly queue: Queue) {}

  async enqueue(request: IndexRequest): Promise<void> {
    await enqueueWithCorrelation(this.queue, INDEX_JOB, { ...request }, jobOptionsFor(request));
  }
}
