import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { enqueueWithCorrelation } from './enqueue-with-correlation';
import type { CorrelatedJobData } from './enqueue-with-correlation';

export const PING_QUEUE = 'ping';

export type PingJobData = { readonly sentAt: string } & CorrelatedJobData;

/**
 * Productor de la cola de prueba `ping` (solo `api`). Se reexporta desde `shared/index.ts`:
 * las raíces de composición registran la cola, así que el productor es API pública del módulo.
 */
@Injectable()
export class PingQueue {
  constructor(
    @InjectQueue(PING_QUEUE) private readonly queue: Queue,
    private readonly logger: PinoLogger,
  ) {}

  async enqueue(): Promise<Job<PingJobData>> {
    const job = await enqueueWithCorrelation(this.queue, PING_QUEUE, {
      sentAt: new Date().toISOString(),
    });
    this.logger.info({ event: 'queue.enqueued', queue: PING_QUEUE, jobId: job.id });
    return job;
  }
}
