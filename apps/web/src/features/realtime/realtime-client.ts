import { SHARED_ERROR_CODES } from '@nimbo/contracts';
import { io, type Socket } from 'socket.io-client';

/** Ruta fija del canal en el `api` (plan 015 §4). */
export const REALTIME_PATH = '/socket.io';

/** Único aviso propio del canal: el servidor lo cierra porque venció el token con que se abrió (CA-4). */
export const SESSION_EXPIRED_EVENT = 'realtime.session-expired';

/** Token que el canal presenta en cada intento; lo actualizan la sesión y la propia renovación del canal. */
export interface TokenHolder {
  current: string | null;
}

export interface RealtimeConnection {
  readonly apiPublicUrl: string;
  readonly token: TokenHolder;
  readonly renew: () => Promise<string | null>;
}

function hasUnauthenticatedCode(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === SHARED_ERROR_CODES.UNAUTHENTICATED
  );
}

function errorData(error: Error): unknown {
  return 'data' in error ? error.data : undefined;
}

/**
 * Abre el canal en el origen de la API (la ruta de la API no es un *namespace*). `auth` es una función: cada intento,
 * también las reconexiones automáticas tras un corte de red (CA-11), lee el token vigente y nunca lo pone en la URL.
 */
function openSocket({ apiPublicUrl, token }: RealtimeConnection): Socket {
  return io(new URL(apiPublicUrl).origin, {
    path: REALTIME_PATH,
    auth: (send) => send({ token: token.current }),
  });
}

/**
 * Mantiene el canal abierto mientras haya sesión: si el servidor lo rechaza o lo cierra por token vencido, renueva la
 * sesión y lo reabre con el token nuevo (CA-4). Devuelve la función que lo cierra.
 */
export function startRealtime(connection: RealtimeConnection): () => void {
  const socket = openSocket(connection);
  let stopped = false;

  const reopenIfUnauthenticated = async (payload: unknown): Promise<void> => {
    if (!hasUnauthenticatedCode(payload)) return;
    const renewed = await connection.renew();
    if (stopped || renewed === null) return;
    connection.token.current = renewed;
    socket.disconnect().connect();
  };

  socket.on('connect_error', (error: Error) => void reopenIfUnauthenticated(errorData(error)));
  socket.on(SESSION_EXPIRED_EVENT, (payload: unknown) => void reopenIfUnauthenticated(payload));

  return () => {
    stopped = true;
    socket.off();
    socket.disconnect();
  };
}
