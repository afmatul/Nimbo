'use client';

import type { SessionListResponse, SessionSummary } from '@nimbo/contracts';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Button } from '../../../components/ui/button';
import { Card, CardDescription, CardHeader } from '../../../components/ui/card';
import { genericErrorMessage, toApiClientError } from '../../../lib/api-error';

import { SessionRow } from './session-row';

const TITLE_ID = 'titulo-sesiones';
const SKELETON_ROWS = 3;
const SKELETON_LINE = 'block h-3 animate-pulse rounded-md bg-muted motion-reduce:animate-none';

type SessionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly correlationId: string }
  | {
      readonly status: 'ready';
      readonly sessions: readonly SessionSummary[];
      /** Instante en que llegó la lista: referencia de «hace …». */
      readonly loadedAt: number;
    };

export interface SessionsCardProps {
  /** `GET /sessions` (plan §5); la tarjeta no conoce la API. */
  readonly loadSessions: () => Promise<SessionListResponse>;
  readonly onRevoke?: (session: SessionSummary) => void;
  readonly onRevokeOthers?: () => void;
}

/** La actual primero; el resto conserva el orden de la API, por última actividad (D-9). */
function currentFirst(items: readonly SessionSummary[]): readonly SessionSummary[] {
  return [...items].sort((a, b) => Number(b.current) - Number(a.current));
}

function useSessions(loadSessions: SessionsCardProps['loadSessions']): {
  readonly state: SessionsState;
  readonly retry: () => void;
} {
  const [state, setState] = React.useState<SessionsState>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    loadSessions().then(
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
  }, [loadSessions, attempt]);

  const retry = React.useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);
  return { state, retry };
}

function openCountLabel(count: number): string {
  return count === 1 ? '1 abierta' : `${String(count)} abiertas`;
}

function SessionsSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex flex-col gap-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-md border border-border p-3">
            <span className="h-10 w-10 shrink-0 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
            <span className="flex flex-1 flex-col gap-2">
              <span className={`${SKELETON_LINE} w-3/5`} />
              <span className={`${SKELETON_LINE} w-2/5`} />
            </span>
          </div>
        ))}
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        Cargando tus sesiones…
      </p>
    </div>
  );
}

interface SessionListProps {
  readonly sessions: readonly SessionSummary[];
  readonly loadedAt: number;
  readonly onRevoke: SessionsCardProps['onRevoke'];
}

function SessionList({ sessions, loadedAt, onRevoke }: SessionListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Sesiones abiertas" className="flex flex-col gap-3">
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} now={loadedAt} onRevoke={onRevoke} />
        ))}
      </ul>
      {sessions.length === 1 && (
        <p className="rounded-md bg-muted p-3 text-sm text-secondary-foreground">
          No tienes otras sesiones abiertas. Si inicias sesión en otro navegador o dispositivo,
          aparecerá aquí.
        </p>
      )}
    </div>
  );
}

function SessionsBody({
  state,
  retry,
  onRevoke,
}: {
  readonly state: SessionsState;
  readonly retry: () => void;
  readonly onRevoke: SessionsCardProps['onRevoke'];
}): React.JSX.Element {
  if (state.status === 'loading') return <SessionsSkeleton />;
  if (state.status === 'ready') {
    return <SessionList sessions={state.sessions} loadedAt={state.loadedAt} onRevoke={onRevoke} />;
  }
  return (
    <StateView
      type="error"
      title="No pudimos cargar tus sesiones."
      description={genericErrorMessage(state.correlationId)}
      action={{ label: 'Reintentar', onClick: retry, variant: 'outline' }}
    />
  );
}

function SessionsTitle({ state }: { readonly state: SessionsState }): React.JSX.Element {
  return (
    <h2 id={TITLE_ID} className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
      Sesiones activas
      {state.status === 'ready' && (
        <span className="text-sm font-normal text-muted-foreground tabular-nums">
          {openCountLabel(state.sessions.length)}
        </span>
      )}
    </h2>
  );
}

/** Tarjeta «Sesiones activas» de «Seguridad»: cargando, error, solo la actual y la lista (CA-11, D-9). */
export function SessionsCard({
  loadSessions,
  onRevoke,
  onRevokeOthers,
}: SessionsCardProps): React.JSX.Element {
  const { state, retry } = useSessions(loadSessions);
  const hasOthers = state.status === 'ready' && state.sessions.length > 1;
  return (
    <Card role="region" aria-labelledby={TITLE_ID} aria-busy={state.status === 'loading'}>
      <CardHeader>
        <SessionsTitle state={state} />
        <CardDescription>
          Estos son los navegadores y dispositivos con tu cuenta abierta. Si no reconoces alguno,
          cierra esa sesión y cambia tu contraseña.
        </CardDescription>
        {hasOthers && (
          <Button variant="outline" type="button" className="self-start" onClick={onRevokeOthers}>
            Cerrar las demás sesiones
          </Button>
        )}
      </CardHeader>
      <div className="p-6 pt-0">
        <SessionsBody state={state} retry={retry} onRevoke={onRevoke} />
      </div>
    </Card>
  );
}
