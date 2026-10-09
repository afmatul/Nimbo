'use client';

import {
  IDENTITY_ERROR_CODES,
  type RevokeOthersResponse,
  type SessionListResponse,
  type SessionSummary,
} from '@nimbo/contracts';
import * as React from 'react';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';

/** Lo que la tarjeta de sesiones pide a la API y a la sesión; la página lo arma (plan §5). */
export interface SessionsActions {
  /** `GET /sessions`. */
  readonly load: () => Promise<SessionListResponse>;
  /** `DELETE /sessions/:id` de otra sesión (CA-12). */
  readonly revoke: (sessionId: string) => Promise<void>;
  /** `POST /sessions/revoke-others` (CA-13). */
  readonly revokeOthers: () => Promise<RevokeOthersResponse>;
  /** Cierra la sesión de este navegador (CA-14, D-8): el `SessionGate` lleva luego a iniciar sesión. */
  readonly signOut: () => Promise<void>;
}

export type SessionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly correlationId: string }
  | {
      readonly status: 'ready';
      readonly sessions: readonly SessionSummary[];
      /** Instante en que llegó la lista: referencia de «hace …». */
      readonly loadedAt: number;
    };

/** Lo que espera confirmación: una sesión o las demás (con cuántas son). */
export type SessionsConfirmation =
  | { readonly kind: 'one'; readonly session: SessionSummary }
  | { readonly kind: 'others'; readonly count: number };

/** Resultado de la última acción, dentro de la tarjeta (README de Seguridad). */
export type SessionsNotice =
  | { readonly kind: 'revoked'; readonly session: SessionSummary }
  | { readonly kind: 'revokedOthers'; readonly count: number }
  | { readonly kind: 'failed'; readonly error: ApiClientError };

export interface SessionsCardModel {
  readonly state: SessionsState;
  readonly retry: () => void;
  readonly confirmation: SessionsConfirmation | null;
  readonly pending: boolean;
  readonly notice: SessionsNotice | null;
  readonly ask: (confirmation: SessionsConfirmation) => void;
  readonly cancel: () => void;
  readonly confirm: () => Promise<void>;
}

type KeepSessions = (predicate: (session: SessionSummary) => boolean) => void;

/** La actual primero; el resto conserva el orden de la API, por última actividad (D-9). */
function currentFirst(items: readonly SessionSummary[]): readonly SessionSummary[] {
  return [...items].sort((a, b) => Number(b.current) - Number(a.current));
}

function useSessionList(load: SessionsActions['load']): {
  readonly state: SessionsState;
  readonly retry: () => void;
  readonly keep: KeepSessions;
} {
  const [state, setState] = React.useState<SessionsState>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    load().then(
      ({ items }) =>
        active &&
        setState({ status: 'ready', sessions: currentFirst(items), loadedAt: Date.now() }),
      (caught: unknown) =>
        active &&
        setState({ status: 'error', correlationId: toApiClientError(caught).correlationId }),
    );
    return () => {
      active = false;
    };
  }, [load, attempt]);

  const retry = React.useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);
  const keep = React.useCallback<KeepSessions>((predicate) => {
    setState((previous) =>
      previous.status === 'ready'
        ? { ...previous, sessions: previous.sessions.filter(predicate) }
        : previous,
    );
  }, []);
  return { state, retry, keep };
}

/** Ejecuta lo confirmado y deja en la lista lo que sigue abierto. La actual no deja aviso: se sale de la cuenta. */
async function perform(
  actions: SessionsActions,
  confirmation: SessionsConfirmation,
  keep: KeepSessions,
): Promise<SessionsNotice | null> {
  if (confirmation.kind === 'others') {
    const { revokedCount } = await actions.revokeOthers();
    keep((session) => session.current);
    return { kind: 'revokedOthers', count: revokedCount };
  }
  const { session } = confirmation;
  if (session.current) {
    await actions.signOut();
    return null;
  }
  await actions.revoke(session.id);
  keep((other) => other.id !== session.id);
  return { kind: 'revoked', session };
}

/** Estado de «Sesiones activas»: la lista, la confirmación en curso y el resultado (CA-11 a CA-14). */
export function useSessionsCard(actions: SessionsActions): SessionsCardModel {
  const { state, retry, keep } = useSessionList(actions.load);
  const [confirmation, setConfirmation] = React.useState<SessionsConfirmation | null>(null);
  const [pending, setPending] = React.useState(false);
  const [notice, setNotice] = React.useState<SessionsNotice | null>(null);

  const confirm = async (): Promise<void> => {
    if (confirmation === null || pending) return;
    setPending(true);
    setNotice(null);
    try {
      setNotice(await perform(actions, confirmation, keep));
    } catch (caught) {
      const error = toApiClientError(caught);
      setNotice({ kind: 'failed', error });
      if (error.code === IDENTITY_ERROR_CODES.SESSION_NOT_FOUND) retry();
    }
    setPending(false);
    setConfirmation(null);
  };

  const cancel = (): void => setConfirmation(null);
  return { state, retry, confirmation, pending, notice, ask: setConfirmation, cancel, confirm };
}
