import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';

import { enqueueWithCorrelation } from '../../../shared';
import type {
  ISaveVersionQueue,
  SaveVersionJob,
} from '../application/ports/i-save-version-queue.port';

/** Cola del guardado de una sesión de edición (`architecture.md` §7.2 paso 5); su procesador corre en el `api`. */
export const SAVE_VERSION_QUEUE = 'editing-save';
const SAVE_VERSION_JOB = 'save-version';
/** Tres intentos con espera exponencial (plan §2); el primer reintento llega a los 2 s. */
const SAVE_VERSION_ATTEMPTS = 3;
const SAVE_VERSION_BACKOFF_MS = 2_000;

/** `jobId` = sesión: el mismo aviso dos veces no encola dos (CA-10). Al completarse se borra, sin la URL en Redis. */
const jobOptionsFor = (job: SaveVersionJob): JobsOptions => ({
  jobId: job.sessionId,
  attempts: SAVE_VERSION_ATTEMPTS,
  backoff: { type: 'exponential', delay: SAVE_VERSION_BACKOFF_MS },
  removeOnComplete: true,
});

/** `ISaveVersionQueue` sobre BullMQ, con el `correlationId` del aviso que lo encola. */
@Injectable()
export class SaveVersionQueue implements ISaveVersionQueue {
  constructor(@InjectQueue(SAVE_VERSION_QUEUE) private readonly queue: Queue) {}

  async enqueue(job: SaveVersionJob): Promise<void> {
    await enqueueWithCorrelation(this.queue, SAVE_VERSION_JOB, { ...job }, jobOptionsFor(job));
  }
}
