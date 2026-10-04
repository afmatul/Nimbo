import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { ITrashPurgeQueue } from '../application/ports/i-trash-purge-queue.port';

import {
  TRASH_PURGE_JOB_NAME,
  TRASH_PURGE_JOB_OPTIONS,
  TRASH_PURGE_QUEUE,
} from './trash-purge.scheduler';
import type { TrashPurgeJobData } from './trash-purge.scheduler';

/**
 * `ITrashPurgeQueue` sobre BullMQ (plan 006 §4): «Vaciar papelera» agrega un trabajo puntual a `trash-purge` con el
 * `correlationId` de la petición; lo atiende el mismo `TrashPurgeProcessor` que el ciclo programado.
 */
@Injectable()
export class TrashPurgeQueue implements ITrashPurgeQueue {
  constructor(@InjectQueue(TRASH_PURGE_QUEUE) private readonly queue: Queue) {}

  async enqueueNow(): Promise<void> {
    const data: TrashPurgeJobData = {
      correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
    };
    await this.queue.add(TRASH_PURGE_JOB_NAME, data, TRASH_PURGE_JOB_OPTIONS);
  }
}
