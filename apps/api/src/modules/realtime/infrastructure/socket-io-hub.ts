import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { errorClassOf } from '../application/error-class';
import type {
  IRealtimePublisher,
  RealtimeNotice,
} from '../application/ports/i-realtime-publisher.port';
import { documentRoom, userRoom } from '../domain/room-names';

import type { RealtimeServer } from './realtime-socket';

/** Lo mínimo del logger que usa el hub. Nunca registra el aviso ni su destino (RN-5, CA-13). */
export interface PublishFailureLogger {
  warn(payload: Record<string, unknown>): void;
}

/**
 * Adaptador del canal en vivo sobre el servidor Socket.IO (plan 015 §2). El gateway lo adjunta en `afterInit`; hasta
 * entonces, o si el servidor falla, avisar no hace nada más que registrar: la operación de negocio que avisa nunca
 * falla ni espera por el canal (RN-7, CA-12).
 */
@Injectable()
export class SocketIoHub implements IRealtimePublisher {
  private server: RealtimeServer | undefined;

  constructor(@Inject(PinoLogger) private readonly logger: PublishFailureLogger) {}

  attach(server: RealtimeServer): void {
    this.server = server;
  }

  toUser(userId: string, notice: RealtimeNotice): void {
    this.emitTo(userRoom(userId), notice);
  }

  toDocument(documentId: string, notice: RealtimeNotice): void {
    this.emitTo(documentRoom(documentId), notice);
  }

  private emitTo(room: string, notice: RealtimeNotice): void {
    if (this.server === undefined) {
      return;
    }
    try {
      this.server.to(room).emit(notice.event, notice.payload);
    } catch (error) {
      this.logger.warn({ event: 'realtime.publish_failed', errorClass: errorClassOf(error) });
    }
  }
}
