/** Ruta fija del canal en vivo en el origen de la API (spec 015, plan §4). */
export const REALTIME_PATH = '/socket.io';

/** Eventos del canal: el aviso de token vencido (CA-4) y el único mensaje del cliente, siempre denegado (CA-7). */
export const REALTIME_EVENTS = {
  SESSION_EXPIRED: 'realtime.session-expired',
  ROOM_JOIN: 'room.join',
} as const;

/** Códigos de error propios del canal (CA-14). Los de autenticación y rol son `SHARED_ERROR_CODES`. */
export const REALTIME_ERROR_CODES = {
  TOO_MANY_REQUESTS: 'REALTIME_TOO_MANY_REQUESTS',
} as const;
