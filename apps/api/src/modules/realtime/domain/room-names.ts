const USER_ROOM_PREFIX = 'user:';
const DOCUMENT_ROOM_PREFIX = 'doc:';

/** Sala con todas las conexiones de un usuario (RN-1). Único lugar que arma su nombre. */
export const userRoom = (userId: string): string => `${USER_ROOM_PREFIX}${userId}`;

/** Sala de las conexiones admitidas por el módulo dueño del documento (RN-1, RN-2). */
export const documentRoom = (documentId: string): string => `${DOCUMENT_ROOM_PREFIX}${documentId}`;

/** Id del documento de una sala de documento; `null` para cualquier otra sala. */
export const documentIdOf = (room: string): string | null =>
  room.startsWith(DOCUMENT_ROOM_PREFIX) ? room.slice(DOCUMENT_ROOM_PREFIX.length) : null;
