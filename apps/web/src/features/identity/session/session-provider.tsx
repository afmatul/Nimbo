'use client';

import { IDENTITY_ERROR_CODES, type SessionResponse, type SessionUser } from '@nimbo/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import { ApiClientError } from '../../../lib/api-error';
import { logout, refresh } from '../api';

import { createRefreshCoordinator, type LockRequester } from './refresh-coordinator';
import { forgetSession, recallSession, rememberSession } from './session-memory';

/** `ended`: la API dijo que la sesión venció o se revocó (CA-8); `unauthenticated`: no hay sesión. */
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'ended';

export interface SessionContextValue {
  readonly status: SessionStatus;
  readonly user: SessionUser | null;
  readonly accessToken: string | null;
  /** Renueva ahora; devuelve el token nuevo o `null` si ya no hay sesión (el estado cambia solo). */
  readonly renew: () => Promise<string | null>;
  readonly signOut: () => Promise<void>;
}

interface SessionState {
  readonly status: SessionStatus;
  readonly session: SessionResponse | null;
}

/** Se renueva un minuto antes de que venza el token de acceso (plan 002 §6.9). */
const RENEW_BEFORE_EXPIRY_MS = 60 * 1000;

const SessionContext = createContext<SessionContextValue | null>(null);

function browserLocks(): LockRequester | undefined {
  return typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
}

function isSessionEnding(caught: unknown): boolean {
  return (
    caught instanceof ApiClientError &&
    (caught.code === IDENTITY_ERROR_CODES.SESSION_EXPIRED ||
      caught.code === IDENTITY_ERROR_CODES.SESSION_REVOKED)
  );
}

/**
 * Sesión del usuario en memoria (D-1, CA-28): `{ status, user, accessToken }`. Al montar usa la sesión recién abierta o
 * la recupera con la cookie de refresco, y la renueva antes de que venza el token.
 */
export function SessionProvider({
  apiPublicUrl,
  children,
}: {
  readonly apiPublicUrl: string;
  readonly children: ReactNode;
}): JSX.Element {
  // En el servidor y tras una recarga no hay sesión en memoria: `loading` en ambos lados, sin desajuste de hidratación.
  const [state, setState] = useState<SessionState>(() => {
    const remembered = recallSession(Date.now());
    return remembered === null
      ? { status: 'loading', session: null }
      : { status: 'authenticated', session: remembered };
  });

  const clear = useCallback((status: 'unauthenticated' | 'ended') => {
    forgetSession();
    setState({ status, session: null });
  }, []);

  const coordinator = useMemo(
    () =>
      createRefreshCoordinator({
        refresh: () => refresh(apiPublicUrl),
        onSessionEnded: () => clear('ended'),
        locks: browserLocks(),
      }),
    [apiPublicUrl, clear],
  );

  const renew = useCallback(
    (): Promise<string | null> =>
      coordinator.run().then(
        (session) => {
          rememberSession(session);
          setState({ status: 'authenticated', session });
          return session.accessToken;
        },
        (caught: unknown) => {
          if (!isSessionEnding(caught)) clear('unauthenticated');
          return null;
        },
      ),
    [coordinator, clear],
  );

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await logout(apiPublicUrl);
    } catch {
      // `logout` es idempotente: aunque la API no responda, esta pestaña deja de tener sesión.
    }
    clear('unauthenticated');
  }, [apiPublicUrl, clear]);

  const needsRestore = state.status === 'loading';
  useEffect(() => {
    if (needsRestore) void renew();
  }, [needsRestore, renew]);

  useEffect(() => {
    if (state.session === null) return undefined;
    const expiresAt = Date.parse(state.session.accessTokenExpiresAt);
    const delay = Math.max(0, expiresAt - Date.now() - RENEW_BEFORE_EXPIRY_MS);
    const timer = setTimeout(() => void renew(), delay);
    return () => clearTimeout(timer);
  }, [state.session, renew]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status: state.status,
      user: state.session?.user ?? null,
      accessToken: state.session?.accessToken ?? null,
      renew,
      signOut,
    }),
    [state, renew, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession debe usarse dentro de <SessionProvider>.');
  return value;
}
