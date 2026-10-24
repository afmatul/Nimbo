import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';

import type { Actor } from '../../../shared';
import { errorClassOf, InsufficientRoleError } from '../../../shared';
import {
  REALTIME_DOCUMENT_LEFT,
  type DocumentLeftEvent,
  type IDocumentRooms,
} from '../application/ports/i-document-rooms.port';
import type {
  IRealtimePublisher,
  RealtimeNotice,
} from '../application/ports/i-realtime-publisher.port';
import { documentIdOf, documentRoom, userRoom } from '../domain/room-names';

import { inConnectionContext, type RealtimeServer, type RealtimeSocket } from './realtime-socket';

/** Lo mínimo del logger que usa el hub. Nunca registra el aviso, su destino ni el mensaje de un error (RN-5, CA-13). */
export interface HubFailureLogger {
  warn(payload: Record<string, unknown>): void;
}

const departuresOf = (socket: RealtimeSocket): DocumentLeftEvent[] =>
  [...socket.rooms].flatMap((room) => {
    const documentId = documentIdOf(room);
    return documentId === null
      ? []
      : [{ userId: socket.data.actor.id, connectionId: socket.id, documentId }];
  });

/**
 * Adaptador único del canal en vivo sobre el servidor Socket.IO (plan 015 §2): implementa los dos puertos de frontera
 * (ISP). El gateway lo adjunta en `afterInit`; hasta entonces, o si el servidor falla, avisar no hace nada más que
 * registrar: la operación de negocio que avisa nunca falla ni espera por el canal (RN-7, CA-12). Como dueño de las
 * salas de documento, también avisa cada salida con `realtime.document-left` (ADR-0019, CA-9) al empezar el cierre de
 * la conexión (`disconnecting`, aún con sus salas), sea limpio, por vencimiento del token o por latido.
 */
@Injectable()
export class SocketIoHub implements IRealtimePublisher, IDocumentRooms {
  private server: RealtimeServer | undefined;

  constructor(
    @Inject(PinoLogger) private readonly logger: HubFailureLogger,
    private readonly emitter: EventEmitter2,
  ) {}

  attach(server: RealtimeServer): void {
    this.server = server;
    server.on('connection', (socket) => {
      socket.on('disconnecting', () => this.announceDepartures(socket));
    });
  }

  toUser(userId: string, notice: RealtimeNotice): void {
    this.emitTo(userRoom(userId), notice);
  }

  toDocument(documentId: string, notice: RealtimeNotice): void {
    this.emitTo(documentRoom(documentId), notice);
  }

  async admit(actor: Actor, connectionId: string, documentId: string): Promise<void> {
    const socket = this.server?.sockets.sockets.get(connectionId);
    if (socket?.data.actor.id !== actor.id) {
      throw new InsufficientRoleError();
    }
    await socket.join(documentRoom(documentId));
  }

  retire(userId: string, documentId: string): Promise<void> {
    this.server?.in(userRoom(userId)).socketsLeave(documentRoom(documentId));
    return Promise.resolve();
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

  private announceDepartures(socket: RealtimeSocket): void {
    inConnectionContext(socket, () => {
      departuresOf(socket).forEach((departure) => this.announceDeparture(departure));
    });
  }

  /** Un oyente que lanza no corta el cierre ni las demás salidas: se registra solo la clase del error (ADR-0019). */
  private announceDeparture(departure: DocumentLeftEvent): void {
    try {
      this.emitter.emit(REALTIME_DOCUMENT_LEFT, departure);
    } catch (error) {
      this.logger.warn({ event: 'realtime.document_left_failed', errorClass: errorClassOf(error) });
    }
  }
}
