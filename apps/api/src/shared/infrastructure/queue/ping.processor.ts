import { randomUUID } from 'node:crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../correlation/correlation-context';

import { PING_QUEUE } from './ping.queue';
import type { PingJobData } from './ping.queue';

/**
 * Consumidor de `ping` (solo `worker`): envuelve el trabajo en `CorrelationContext.run` con el
 * `correlationId` que viajó en `data` (o uno nuevo) y `jobId`, así toda bitácora los lleva (CA-14).
 */
@Processor(PING_QUEUE)
export class PingProcessor extends WorkerHost {
  constructor(private readonly logger: PinoLogger) {
    super();
  }

  process(job: Job<Partial<PingJobData>>): Promise<{ pong: true }> {
    const store = {
      correlationId: job.data.correlationId ?? randomUUID(),
      jobId: String(job.id),
    };
    return CorrelationContext.run(store, () => this.handle(job));
  }

  private handle(job: Job<Partial<PingJobData>>): Promise<{ pong: true }> {
    const context = { queue: PING_QUEUE, jobId: job.id, attemptsMade: job.attemptsMade };
    this.logger.info({ event: 'job.started', ...context });
    this.logger.info({ event: 'job.completed', ...context });
    return Promise.resolve({ pong: true });
  }
}
