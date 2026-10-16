import { randomUUID } from 'node:crypto';

import { Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { PinoLogger } from 'nestjs-pino';
import type { DisconnectReason } from 'socket.io';

import { CorrelationContext, DomainError, UnauthenticatedError } from '../../../shared';
import {
  ConnectionAdmission,
  type ConnectionAttempt,
} from '../application/connection-admission.service';
import { userRoom } from '../domain/room-names';
import type { RealtimeServer, RealtimeSocket } from '../infrastructure/realtime-socket';

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

const withCorrelation = <T>(socket: RealtimeSocket, callback: () => T): T =>
  CorrelationContext.run({ correlationId: socket.data.correlationId }, callback);

/**
 * Único gateway del canal en vivo (ADR-0010, ADR-0028). `afterInit` registra el *middleware* de *handshake*, que
 * delega la decisión en `ConnectionAdmission` (CA-2, CA-3, CA-14); la conexión admitida se une sola a su sala de
 * usuario (CA-1). Bitácoras (CA-13): `realtime.connected` y `realtime.disconnected` aquí, con el `correlationId` de la
 * conexión; `realtime.rejected` la registra `ConnectionAdmission` (y el adaptador, si el `Origin` no está listado).
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit<RealtimeServer>, OnGatewayConnection {
  @WebSocketServer() readonly server!: RealtimeServer;

  constructor(
    private readonly admission: ConnectionAdmission,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  afterInit(server: RealtimeServer): void {
    server.use((socket, next) => void this.authenticate(socket, next));
  }

  handleConnection(socket: RealtimeSocket): void {
    const { actor } = socket.data;
    void socket.join(userRoom(actor.id));
    socket.on('disconnect', (reason) => this.logDisconnected(socket, reason));
    withCorrelation(socket, () =>
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
    const errorClass = error instanceof Error ? error.constructor.name : typeof error;
    CorrelationContext.run({ correlationId }, () =>
      this.logger.error({ event: 'realtime.rejected', reason: 'unexpected_error', errorClass }),
    );
    return new UnauthenticatedError();
  }

  private logDisconnected(socket: RealtimeSocket, reason: DisconnectReason): void {
    withCorrelation(socket, () =>
      this.logger.info({
        event: 'realtime.disconnected',
        userId: socket.data.actor.id,
        connectionId: socket.id,
        reason,
      }),
    );
  }
}
