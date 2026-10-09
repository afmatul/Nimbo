'use client';

import type { SessionSummary } from '@nimbo/contracts';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Button } from '../../../components/ui/button';
import { Card, CardDescription, CardHeader } from '../../../components/ui/card';
import { genericErrorMessage } from '../../../lib/api-error';
import {
  useSessionsCard,
  type SessionsActions,
  type SessionsCardModel,
  type SessionsState,
} from '../hooks/use-sessions-card';

import { SessionRow } from './session-row';
import { SessionsConfirmDialog, SessionsNoticeAlert } from './sessions-feedback';

const TITLE_ID = 'titulo-sesiones';
const SKELETON_ROWS = 3;
const SKELETON_LINE = 'block h-3 animate-pulse rounded-md bg-muted motion-reduce:animate-none';

export interface SessionsCardProps {
  readonly actions: SessionsActions;
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

type RevokeOne = (session: SessionSummary) => void;

interface SessionListProps {
  readonly sessions: readonly SessionSummary[];
  readonly loadedAt: number;
  readonly onRevoke: RevokeOne;
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

function SessionsBody({ model }: { readonly model: SessionsCardModel }): React.JSX.Element {
  const { state, retry, ask } = model;
  if (state.status === 'loading') return <SessionsSkeleton />;
  if (state.status === 'ready') {
    const revoke: RevokeOne = (session) => ask({ kind: 'one', session });
    return <SessionList sessions={state.sessions} loadedAt={state.loadedAt} onRevoke={revoke} />;
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

/** «Cerrar las demás sesiones» solo si hay otras (no se deshabilita: README de Seguridad). */
function RevokeOthersButton({
  model,
}: {
  readonly model: SessionsCardModel;
}): React.JSX.Element | null {
  const { state, ask } = model;
  if (state.status !== 'ready' || state.sessions.length <= 1) return null;
  const count = state.sessions.length - 1;
  return (
    <Button
      variant="outline"
      type="button"
      className="self-start"
      onClick={() => ask({ kind: 'others', count })}
    >
      Cerrar las demás sesiones
    </Button>
  );
}

/**
 * Tarjeta «Sesiones activas» de «Seguridad» (CA-11 a CA-14, D-8, D-9): la lista, cerrar una (la actual equivale a cerrar
 * sesión), cerrar las demás y el resultado dentro de la tarjeta. Toda acción pide confirmación.
 */
export function SessionsCard({ actions }: SessionsCardProps): React.JSX.Element {
  const model = useSessionsCard(actions);
  return (
    <Card role="region" aria-labelledby={TITLE_ID} aria-busy={model.state.status === 'loading'}>
      <CardHeader>
        <SessionsTitle state={model.state} />
        <CardDescription>
          Estos son los navegadores y dispositivos con tu cuenta abierta. Si no reconoces alguno,
          cierra esa sesión y cambia tu contraseña.
        </CardDescription>
        <RevokeOthersButton model={model} />
      </CardHeader>
      <div className="flex flex-col gap-3 p-6 pt-0">
        <SessionsNoticeAlert notice={model.notice} />
        <SessionsBody model={model} />
      </div>
      <SessionsConfirmDialog
        confirmation={model.confirmation}
        pending={model.pending}
        onCancel={model.cancel}
        onConfirm={() => void model.confirm()}
      />
    </Card>
  );
}
