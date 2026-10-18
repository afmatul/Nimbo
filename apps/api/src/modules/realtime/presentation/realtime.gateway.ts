import { randomUUID } from 'node:crypto';

import { Inject } from '@nestjs/common';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { REALTIME_EVENTS } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';
import type { DisconnectReason } from 'socket.io';

import {
  CorrelationContext,
  DomainError,
  InsufficientRoleError,
  UnauthenticatedError,
} from '../../../shared';
import {
  ConnectionAdmission,
  type ConnectionAttempt,
} from '../application/connection-admission.service';
import { errorClassOf } from '../application/error-class';
import { userRoom } from '../domain/room-names';
import { ConnectionLifetime } from '../infrastructure/connection-lifetime';
import {
  inConnectionContext,
  type RealtimeServer,
  type RealtimeSocket,
} from '../infrastructure/realtime-socket';
import { SocketIoHub } from '../infrastructure/socket-io-hub';

import { connectionOrigin } from './connection-origin';
import { toHandshakeError } from './handshake-error';

type HandshakeNext = (error?: Error) => void;

/** El token solo se lee de `auth.token` y solo si es texto: nunca de la URL ni de cabeceras (plan §5). */
const attemptOf = (socket: RealtimeSocket): ConnectionAttempt => {
  const token: unknown = (socket.handshake.auth as Record<string, unknown>).token;
  return {
    origin: connectionOrigin(socket.handshake),
    token: typeof token === 'string' ? token : undefined,
  };
};

/** Respuesta (*ack*) a `room.join`: el cliente nunca elige sus salas (CA-7, RN-2). */
export interface RoomJoinDenied {
  readonly error: { readonly code: string };
}

const ROOM_JOIN_DENIED: RoomJoinDenied = { error: { code: new InsufficientRoleError().code } };

/**
 * Único gateway del canal en vivo (ADR-0010, ADR-0030). `afterInit` registra el *middleware* de *handshake*, que
 * delega la decisión en `ConnectionAdmission` (CA-2, CA-3, CA-14); la conexión admitida se une sola a su sala de
 * usuario (CA-1). Bitácoras (CA-13): `realtime.connected` y `realtime.disconnected` aquí, con el `correlationId` de la
 * conexión; `realtime.rejected` la registra `ConnectionAdmission` (y el adaptador, si el `Origin` no está listado).
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit<RealtimeServer>, OnGatewayConnection {
  @WebSocketServer() readonly server!: RealtimeServer;

  constructor(
    private readonly admission: ConnectionAdmission,
    private readonly lifetime: ConnectionLifetime,
    private readonly hub: SocketIoHub,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  afterInit(server: RealtimeServer): void {
    this.hub.attach(server);
    server.use((socket, next) => void this.authenticate(socket, next));
  }

  /** Único mensaje del cliente con manejador, y siempre se deniega: las salas las decide el servidor (CA-7, RN-4). */
  @SubscribeMessage(REALTIME_EVENTS.ROOM_JOIN)
  denyRoomJoin(): RoomJoinDenied {
    return ROOM_JOIN_DENIED;
  }

  handleConnection(socket: RealtimeSocket): void {
    const { actor } = socket.data;
    void socket.join(userRoom(actor.id));
    socket.on('disconnect', (reason) => this.logDisconnected(socket, reason));
    this.lifetime.watch(socket);
    inConnectionContext(socket, () =>
      this.logger.info({ event: 'realtime.connected', userId: actor.id, connectionId: socket.id }),
    );
  }

  private async authenticate(socket: RealtimeSocket, next: HandshakeNext): Promise<void> {
    const correlationId = randomUUID();
    try {
      const admitted = await CorrelationContext.run({ correlationId }, () =>
        this.admission.admit(attemptOf(socket)),
      );
      socket.data = { correlationId, ...admitted };
      next();
    } catch (error) {
      next(toHandshakeError(this.asDomainError(error, correlationId)));
    }
  }

  /** `ConnectionAdmission` solo lanza errores de dominio; cualquier otro se registra y se rechaza sin detalle. */
  private asDomainError(error: unknown, correlationId: string): DomainError {
    if (error instanceof DomainError) {
      return error;
    }
    CorrelationContext.run({ correlationId }, () =>
      this.logger.error({
        event: 'realtime.rejected',
        reason: 'unexpected_error',
        errorClass: errorClassOf(error),
      }),
    );
    return new UnauthenticatedError();
  }

  private logDisconnected(socket: RealtimeSocket, reason: DisconnectReason): void {
    inConnectionContext(socket, () =>
      this.logger.info({
        event: 'realtime.disconnected',
        userId: socket.data.actor.id,
        connectionId: socket.id,
        reason,
      }),
    );
  }
}
