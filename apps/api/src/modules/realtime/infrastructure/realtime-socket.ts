import type { DefaultEventsMap, Server, Socket } from 'socket.io';

import type { Actor } from '../../../shared';

/**
 * Lo que el *handshake* guarda en `socket.data` de una conexión admitida (plan §5): su `correlationId` para las
 * bitácoras, el `Actor` y la hora en que vence su token (CA-4).
 */
export interface ConnectionData {
  readonly correlationId: string;
  readonly actor: Actor;
  readonly expiresAt: Date;
}

/** Conexión del canal en vivo con sus datos tipados. */
export type RealtimeSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  ConnectionData
>;

/** Servidor Socket.IO del canal (uno por proceso `api`, ADR-0028). */
export type RealtimeServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  ConnectionData
>;
