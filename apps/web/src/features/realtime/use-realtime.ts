'use client';

import { createContext, useContext } from 'react';

/** Manejador de un aviso del canal; el contenido se valida con el esquema del módulo que lo consume. */
export type RealtimeHandler = (payload: unknown) => void;

/**
 * Canal en vivo de la pestaña (015) visto por las pantallas (016): el id de la conexión vigente, que el servidor usa
 * para admitirla en la sala de un documento, y la suscripción a un aviso. `on` devuelve la función que da de baja.
 */
export interface RealtimeChannel {
  readonly connectionId: string | null;
  readonly on: (event: string, handler: RealtimeHandler) => () => void;
}

/** Sin canal (fuera del proveedor, rol interno o antes de abrirlo): no hay conexión ni avisos. */
export const NO_REALTIME_CHANNEL: RealtimeChannel = {
  connectionId: null,
  on: () => () => undefined,
};

export const RealtimeContext = createContext<RealtimeChannel>(NO_REALTIME_CHANNEL);

/** El canal abierto por `RealtimeProvider`; los avisos de negocio llegan por aquí (016). */
export function useRealtime(): RealtimeChannel {
  return useContext(RealtimeContext);
}
