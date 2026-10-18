'use client';

import { useEffect, useRef, type JSX, type ReactNode } from 'react';

import { CLIENT_ROLES } from '../access/home-path';
import { useSession } from '../identity/session/session-provider';

import { startRealtime } from './realtime-client';

/**
 * Canal en vivo de la pestaña (spec 015), solo para un cliente con sesión: lo abre, lo reabre con un token renovado
 * (CA-4) y deja que `socket.io-client` lo reconecte tras un corte (CA-11). Sin interfaz propia (P-1) ni eventos de
 * negocio: `useRealtime()` llega con 016, su primer consumidor.
 */
export function RealtimeProvider({
  apiPublicUrl,
  children,
}: {
  readonly apiPublicUrl: string;
  readonly children: ReactNode;
}): JSX.Element {
  const { user, accessToken, renew } = useSession();
  const token = useRef<string | null>(accessToken);
  const isClient = user !== null && CLIENT_ROLES.includes(user.role);

  useEffect(() => {
    token.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (!isClient) return undefined;
    return startRealtime({ apiPublicUrl, token, renew });
  }, [isClient, apiPublicUrl, renew]);

  return <>{children}</>;
}
