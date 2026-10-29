import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';

import { enqueueWithCorrelation } from '../../../shared';
import type { IJobQueue, OptimizationTask } from '../application/ports/i-job-queue.port';

/** Cola del optimizador (plan 021 §2, `architecture.md` §8): la llena el `api` y la consume el `worker`. */
export const OPTIMIZATION_QUEUE = 'optimization';
export const ESTIMATE_JOB = 'estimate';
export const RUN_JOB = 'run';
/** Primera espera antes de reintentar; después crece exponencialmente (como la indexación, 019). */
const OPTIMIZATION_BACKOFF_MS = 2_000;

/** Intentos por trabajo (`OPTIMIZER_MAX_ATTEMPTS`): el `api` los guarda en `job.opts.attempts` al encolar. */
export interface JobQueueConfig {
  readonly maxAttempts: number;
}

export const JOB_QUEUE_CONFIG = Symbol('JobQueueConfig');

/**
 * Un trabajo por operación y optimización (`estimate-<id>` / `run-<id>`; sin `:`, que BullMQ no admite en ids propios).
 * `removeOnComplete/Fail` lo borran al terminar: el estado de negocio vive en `optimizacion`, no en la cola.
 */
const jobOptionsFor = (jobId: string, config: JobQueueConfig): JobsOptions => ({
  jobId,
  attempts: config.maxAttempts,
  backoff: { type: 'exponential', delay: OPTIMIZATION_BACKOFF_MS },
  removeOnComplete: true,
  removeOnFail: true,
});

/** `IJobQueue` sobre BullMQ, con el `correlationId` de la petición que encola. */
@Injectable()
export class BullmqJobQueue implements IJobQueue {
  constructor(
    @InjectQueue(OPTIMIZATION_QUEUE) private readonly queue: Queue,
    @Inject(JOB_QUEUE_CONFIG) private readonly config: JobQueueConfig,
  ) {}

  async enqueueEstimate(task: OptimizationTask): Promise<void> {
    await this.enqueue(ESTIMATE_JOB, task);
  }

  async enqueueRun(task: OptimizationTask): Promise<void> {
    await this.enqueue(RUN_JOB, task);
  }

  private async enqueue(name: string, task: OptimizationTask): Promise<void> {
    const data = {
      optimizationId: task.optimizationId,
      fileId: task.fileId,
      ownerId: task.ownerId,
    };
    const options = jobOptionsFor(`${name}-${task.optimizationId}`, this.config);
    await enqueueWithCorrelation(this.queue, name, data, options);
  }
}
