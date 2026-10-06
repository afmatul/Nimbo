'use client';

import { useMemo } from 'react';

import { listSessions, revokeOtherSessions, revokeSession } from '../api';
import type { AuthFetch } from '../session/auth-fetch';
import { useSession } from '../session/session-provider';

import type { SessionsActions } from './use-sessions-card';

/** Acciones de «Sesiones activas» sobre la API (plan §5) y el cierre de sesión del `SessionProvider` (CA-14). */
export function useSessionsActions(apiPublicUrl: string, authFetch: AuthFetch): SessionsActions {
  const { signOut } = useSession();
  return useMemo(
    () => ({
      load: () => listSessions(apiPublicUrl, authFetch),
      revoke: (sessionId) => revokeSession(apiPublicUrl, authFetch, sessionId),
      revokeOthers: () => revokeOtherSessions(apiPublicUrl, authFetch),
      signOut,
    }),
    [apiPublicUrl, authFetch, signOut],
  );
}
