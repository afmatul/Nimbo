import { Inject, Injectable } from '@nestjs/common';
import { SHARED_ERROR_CODES } from '@nimbo/contracts';

import { I_CLOCK } from '../../../shared';
import type { IClock } from '../../../shared';

import type { RealtimeSocket } from './realtime-socket';

/** Único aviso propio del canal (plan §4, RN-10): el servidor lo cierra porque venció el token con que se abrió. */
export const SESSION_EXPIRED_EVENT = 'realtime.session-expired';

const expire = (socket: RealtimeSocket): void => {
  socket.emit(SESSION_EXPIRED_EVENT, { code: SHARED_ERROR_CODES.UNAUTHENTICATED });
  socket.disconnect();
};

/**
 * Vigencia de una conexión admitida (CA-4): al llegar `expiresAt` del token con que se abrió, avisa
 * `realtime.session-expired` y la cierra; el cliente la reabre con un token renovado. Si la conexión se cierra antes,
 * cancela el temporizador para no dejar fugas. Sin interfaz: una sola implementación (Art. V.2).
 */
@Injectable()
export class ConnectionLifetime {
  constructor(@Inject(I_CLOCK) private readonly clock: IClock) {}

  watch(socket: RealtimeSocket): void {
    const remainingMs = socket.data.expiresAt.getTime() - this.clock.now().getTime();
    const timer = setTimeout(() => expire(socket), remainingMs);
    socket.once('disconnect', () => clearTimeout(timer));
  }
}
