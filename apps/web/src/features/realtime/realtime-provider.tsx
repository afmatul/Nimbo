'use client';

import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';

import { CLIENT_ROLES } from '../access/home-path';
import { useSession } from '../identity/session/session-provider';

import { startRealtime } from './realtime-client';
import { NO_REALTIME_CHANNEL, RealtimeContext, type RealtimeChannel } from './use-realtime';

/** Canal de la pestaña: el `Socket` abierto y el id de su conexión vigente (cambia al reconectar). */
function useOpenSocket(apiPublicUrl: string): {
  socket: Socket | null;
  connectionId: string | null;
} {
  const { user, accessToken, renew } = useSession();
  const token = useRef<string | null>(accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const isClient = user !== null && CLIENT_ROLES.includes(user.role);

  useEffect(() => {
    token.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (!isClient) return undefined;
    const started = startRealtime({ apiPublicUrl, token, renew });
    started.socket.on('connect', () => setConnectionId(started.socket.id ?? null));
    started.socket.on('disconnect', () => setConnectionId(null));
    setSocket(started.socket);
    return () => {
      started.stop();
      setSocket(null);
      setConnectionId(null);
    };
  }, [isClient, apiPublicUrl, renew]);

  return { socket, connectionId };
}

function channelOf(socket: Socket | null, connectionId: string | null): RealtimeChannel {
  if (socket === null) return NO_REALTIME_CHANNEL;
  return {
    connectionId,
    on: (event, handler) => {
      socket.on(event, handler);
      return () => void socket.off(event, handler);
    },
  };
}

/**
 * Canal en vivo de la pestaña (spec 015), solo para un cliente con sesión: lo abre, lo reabre con un token renovado
 * (CA-4) y deja que `socket.io-client` lo reconecte tras un corte (CA-11). Sin interfaz propia (P-1): las pantallas lo
 * usan con `useRealtime()` (016).
 */
export function RealtimeProvider({
  apiPublicUrl,
  children,
}: {
  readonly apiPublicUrl: string;
  readonly children: ReactNode;
}): JSX.Element {
  const { socket, connectionId } = useOpenSocket(apiPublicUrl);
  const channel = useMemo(() => channelOf(socket, connectionId), [socket, connectionId]);
  return <RealtimeContext.Provider value={channel}>{children}</RealtimeContext.Provider>;
}
