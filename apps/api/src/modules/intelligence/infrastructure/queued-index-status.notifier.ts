import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';

import { enqueueWithCorrelation } from '../../../shared';
import type {
  IIndexStatusNotifier,
  IndexStatusChange,
} from '../application/ports/i-index-status-notifier.port';

/** Cola del aviso de estado (ADR-0030, D-2): la llena el `worker` y la retransmite el `api` por su canal en vivo. */
export const INDEX_STATUS_QUEUE = 'index-status';
export const INDEX_STATUS_JOB = 'status-changed';

/** Un aviso no se guarda: se borra al entregarse o al fallar (es de mejor esfuerzo). */
const JOB_OPTIONS: JobsOptions = { removeOnComplete: true, removeOnFail: true };

/**
 * `IIndexStatusNotifier` del `worker` (plan 019 §1, «Aviso en vivo»): los sockets viven en el `api`, así que publica el
 * cambio en `index-status` con el `correlationId` del trabajo. Solo propietaria, archivo, estado y motivo: sin nombre,
 * texto ni versión (CA-21). Un fallo de Redis sube al llamador, que lo registra sin tocar el estado guardado.
 */
@Injectable()
export class QueuedIndexStatusNotifier implements IIndexStatusNotifier {
  constructor(@InjectQueue(INDEX_STATUS_QUEUE) private readonly queue: Queue) {}

  async notify(change: IndexStatusChange): Promise<void> {
    const { ownerId, fileId, state, reason } = change;
    const data = { ownerId, fileId, state, reason };
    await enqueueWithCorrelation(this.queue, INDEX_STATUS_JOB, data, JOB_OPTIONS);
  }
}
