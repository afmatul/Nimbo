import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { enqueueWithCorrelation, REPEATABLE_JOB_OPTIONS } from '../../../shared';
import type { ITrashPurgeQueue } from '../application/ports/i-trash-purge-queue.port';

import { TRASH_PURGE_JOB_NAME, TRASH_PURGE_QUEUE } from './trash-purge.scheduler';

/**
 * `ITrashPurgeQueue` sobre BullMQ (plan 006 §4): «Vaciar papelera» agrega un trabajo puntual a `trash-purge` con el
 * `correlationId` de la petición y las mismas opciones que el ciclo programado; lo atiende el mismo
 * `TrashPurgeProcessor`.
 */
@Injectable()
export class TrashPurgeQueue implements ITrashPurgeQueue {
  constructor(@InjectQueue(TRASH_PURGE_QUEUE) private readonly queue: Queue) {}

  async enqueueNow(): Promise<void> {
    await enqueueWithCorrelation(this.queue, TRASH_PURGE_JOB_NAME, {}, REPEATABLE_JOB_OPTIONS);
  }
}
