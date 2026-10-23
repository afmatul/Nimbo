import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { I_INDEX_STATUS_NOTIFIER } from '../application/ports/i-index-status-notifier.port';
import type {
  IIndexStatusNotifier,
  IndexStatusChange,
} from '../application/ports/i-index-status-notifier.port';

import { INDEX_STATUS_QUEUE } from './queued-index-status.notifier';

/** Datos de un aviso de `index-status`: el cambio y el `correlationId` que agrega `enqueueWithCorrelation`. */
export type IndexStatusJobData = IndexStatusChange & { readonly correlationId?: string };

/**
 * Relay de `index-status` **en el `api`** (ADR-0031 d, D-2): los sockets de 015 viven aquí, así que retransmite cada
 * cambio que encoló el `worker` con el notificador del `api` (`RealtimeIndexStatusNotifier`, `toUser(ownerId)`). Solo
 * pasa archivo, estado y motivo: ni `ownerId` ni `correlationId` llegan al navegador. Sin reintentos: el aviso es de
 * mejor esfuerzo y el estado guardado no depende de él.
 */
@Processor(INDEX_STATUS_QUEUE)
export class IndexStatusRelay extends WorkerHost {
  constructor(@Inject(I_INDEX_STATUS_NOTIFIER) private readonly notifier: IIndexStatusNotifier) {
    super();
  }

  process(job: Job<IndexStatusJobData>): Promise<void> {
    const { ownerId, fileId, state, reason } = job.data;
    return this.notifier.notify({ ownerId, fileId, state, reason });
  }
}
