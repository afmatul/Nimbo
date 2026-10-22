import { Inject, Injectable } from '@nestjs/common';
import { INDEXING_EVENTS } from '@nimbo/contracts';

import { I_REALTIME_PUBLISHER } from '../../realtime';
import type { IRealtimePublisher } from '../../realtime';
import type {
  IIndexStatusNotifier,
  IndexStatusChange,
} from '../application/ports/i-index-status-notifier.port';

/**
 * `IIndexStatusNotifier` del `api` (ADR-0030): avisa directo por el canal de 015 a las conexiones de la propietaria
 * (`toUser`). Hasta 012 no llega a quienes comparten el archivo (PD-120). `toUser` es síncrono y nunca lanza.
 */
@Injectable()
export class RealtimeIndexStatusNotifier implements IIndexStatusNotifier {
  constructor(@Inject(I_REALTIME_PUBLISHER) private readonly publisher: IRealtimePublisher) {}

  notify(change: IndexStatusChange): Promise<void> {
    const { fileId, state, reason } = change;
    this.publisher.toUser(change.ownerId, {
      event: INDEXING_EVENTS.STATUS_CHANGED,
      payload: { fileId, state, reason },
    });
    return Promise.resolve();
  }
}
