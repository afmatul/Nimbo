'use client';

import type { AgentStatusResponse } from '@nimbo/contracts';
import { CircleAlert, Sparkles, X } from 'lucide-react';
import * as React from 'react';

import { dayMonthLabel } from '../../lib/format-date';
import { formatCount } from '../../lib/format-plan';
import { cn } from '../../lib/utils';

import { AgentAnswer, type AgentCitationsByOrdinal } from './agent-answer';
import { AgentPanelComposer } from './agent-panel-composer';
import {
  composerLockOf,
  fieldErrorOf,
  ScreenNotice,
  type AgentPanelNotice,
  type AgentPanelScreen,
} from './agent-panel-notices';
import { AgentEmptyState, AgentIntro } from './agent-panel-states';
import { quotaPercentOf, quotaTierOf, type QuotaTier } from './quota-bar';
import { StateView } from './state-view';
import { trapTabKey, useAgentSheetFocus, useIsAgentSheet } from './use-agent-sheet';

export type { AgentPanelNotice, AgentPanelScreen } from './agent-panel-notices';

/** Una pregunta y su respuesta tal como las pinta `AgentAnswer`. */
export interface AgentPanelTurn {
  readonly id: number;
  readonly question: string;
  readonly text: string;
  readonly citations: AgentCitationsByOrdinal;
}

export interface AgentPanelProps {
  readonly screen: AgentPanelScreen;
  /** `GET /agent/status`: contador, renovación, archivos indexados y máximo de la pregunta. `null` hasta leerlo. */
  readonly status: AgentStatusResponse | null;
  readonly turns: readonly AgentPanelTurn[];
  /** Selector del ámbito vigente («Todos mis archivos» por omisión); lo provee quien monta el panel. */
  readonly scopeControl: React.ReactNode;
  /** Envía la pregunta; `false` si no se envió y el campo conserva lo escrito. */
  readonly onAsk: (question: string) => boolean;
  readonly onStop: () => void;
  readonly onUploadFiles: () => void;
  /** Cierra el panel; quien lo monta lo desmonta y el foco vuelve a quien lo abrió. */
  readonly onClose: () => void;
  /** Mensaje del fallo vigente ya resuelto por el catálogo; `null` sin fallo (CA-7, CA-8, CA-9, CA-16). */
  readonly notice: AgentPanelNotice | null;
  /** «Reintentar» de `no-disponible` (CA-9): vuelve a enviar la última pregunta. */
  readonly onRetry: () => void;
}

const TITLE_ID = 'agente-titulo';

/** Relleno del medidor por tramo de `QuotaBar` (mockup: `agent-accent`, `warning` desde 70 %, `destructive-soft` al 100 %). */
const METER_FILL: Readonly<Record<QuotaTier, string>> = {
  normal: 'bg-agent-accent',
  warning: 'bg-warning',
  critical: 'bg-warning',
  full: 'bg-destructive-soft',
};

function QuotaMeter({
  used,
  limit,
}: Pick<AgentStatusResponse, 'used' | 'limit'>): React.JSX.Element {
  const percent = quotaPercentOf(used, limit);
  const tier = quotaTierOf(percent);
  return (
    <div
      role="progressbar"
      aria-label="Consultas usadas este mes"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={Math.min(used, limit)}
      aria-valuetext={`${formatCount(used)} de ${formatCount(limit)} consultas`}
      data-tier={tier}
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-agent-tag"
    >
      <div
        className={cn('h-full rounded-full', METER_FILL[tier])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** «N de L consultas este mes» con la renovación o, agotadas, «Sin consultas disponibles» (CA-1). */
function AgentQuota({ status }: { readonly status: AgentStatusResponse }): React.JSX.Element {
  const { used, limit, resetsAt } = status;
  const exhausted = used >= limit;
  return (
    <div>
      <p className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <strong className="font-semibold">{`${formatCount(used)} de ${formatCount(limit)} consultas este mes`}</strong>
        {exhausted && (
          <span className="inline-flex items-center gap-1 font-semibold">
            <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Sin consultas disponibles
          </span>
        )}
        {!exhausted && resetsAt !== null && (
          <span>{`Se renuevan el ${dayMonthLabel(resetsAt)}`}</span>
        )}
      </p>
      <QuotaMeter used={used} limit={limit} />
    </div>
  );
}

function CloseButton({ onClose }: Pick<AgentPanelProps, 'onClose'>): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Cerrar el agente"
      onClick={onClose}
      className="-mr-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-agent-text hover:bg-agent-tag focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agent-accent"
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

function AgentPanelHeader({
  status,
  scopeControl,
  onClose,
}: Pick<AgentPanelProps, 'status' | 'scopeControl' | 'onClose'>): React.JSX.Element {
  return (
    <div className="grid gap-2.5 px-4 pt-2 pb-3">
      <div className="flex min-h-11 items-center gap-2.5">
        <Sparkles className="h-5 w-5 text-agent-accent" aria-hidden="true" />
        <h2 id={TITLE_ID} className="flex-1 text-base font-semibold">
          Agente Nimbo
        </h2>
        <CloseButton onClose={onClose} />
      </div>
      {status !== null && <AgentQuota status={status} />}
      {scopeControl}
    </div>
  );
}

/** Lo que va antes de la primera pregunta: carga, `vacio` o `inicio`. */
function ThreadStart({
  screen,
  status,
  onUploadFiles,
}: Pick<AgentPanelProps, 'screen' | 'status' | 'onUploadFiles'>): React.JSX.Element {
  if (screen === 'cargando') {
    return <StateView type="loading" title="Cargando el agente…" className="my-auto" />;
  }
  if (status?.hasIndexedFiles === false) return <AgentEmptyState onUploadFiles={onUploadFiles} />;
  return <AgentIntro />;
}

interface AgentTurnsProps {
  readonly turns: readonly AgentPanelTurn[];
  /** Solo el último turno se escribe en vivo. */
  readonly isStreaming: boolean;
  readonly onStop: () => void;
}

function AgentTurns({ turns, isStreaming, onStop }: AgentTurnsProps): React.JSX.Element {
  const lastIndex = turns.length - 1;
  return (
    <>
      {turns.map((turn, index) => (
        <AgentAnswer
          key={turn.id}
          question={turn.question}
          text={turn.text}
          citations={turn.citations}
          isStreaming={isStreaming && index === lastIndex}
          onStop={onStop}
        />
      ))}
    </>
  );
}

/** Conversación en `role="log"`: lo nuevo se anuncia con calma y `aria-busy` mientras llega texto (CA-19). */
function AgentThread(
  props: Omit<AgentPanelProps, 'scopeControl' | 'onAsk' | 'onClose'>,
): React.JSX.Element {
  const { screen, turns, onStop, notice, onRetry } = props;
  const isStreaming = screen === 'respondiendo';
  return (
    <div
      role="log"
      aria-label="Conversación con el agente"
      aria-live="polite"
      aria-busy={isStreaming || undefined}
      className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto border-t border-agent-tag px-4 pt-2 pb-5"
    >
      {turns.length === 0 && <ThreadStart {...props} />}
      <AgentTurns turns={turns} isStreaming={isStreaming} onStop={onStop} />
      <ScreenNotice screen={screen} notice={notice} onRetry={onRetry} />
    </div>
  );
}

/** Hoja modal a pantalla completa (≤ 900 px) o complemento de 420 px bajo el encabezado. */
const ROOT_LAYOUT = {
  sheet: 'top-0 left-0',
  complement: 'top-header z-30 w-105 border-l border-agent-tag shadow-modal',
} as const;

/**
 * Panel del agente (020b D-5): presentacional, recibe la sesión por props. A más de 900 px es un complemento no modal
 * de 420 px a la derecha, bajo el encabezado; a ≤ 900 px, una hoja modal a pantalla completa con el fondo `inert` y el
 * foco atrapado. Escape lo cierra y, al cerrar, el foco vuelve a quien lo abrió. Sin animaciones propias.
 */
export function AgentPanel(props: AgentPanelProps): React.JSX.Element {
  const isSheet = useIsAgentSheet();
  const ref = React.useRef<HTMLElement>(null);
  useAgentSheetFocus(ref, isSheet);
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') props.onClose();
    else if (isSheet) trapTabKey(event);
  };
  const Root = isSheet ? 'section' : 'aside';
  return (
    <Root
      ref={ref}
      role={isSheet ? 'dialog' : undefined}
      aria-modal={isSheet || undefined}
      aria-labelledby={TITLE_ID}
      onKeyDown={onKeyDown}
      className={cn(
        'fixed right-0 bottom-0 z-50 flex flex-col overflow-y-auto bg-agent-bg text-agent-text',
        isSheet ? ROOT_LAYOUT.sheet : ROOT_LAYOUT.complement,
      )}
    >
      <AgentPanelHeader {...props} />
      <AgentThread {...props} />
      <AgentPanelComposer
        maxChars={props.status?.maxQuestionChars ?? null}
        lock={composerLockOf(props.screen, props.status)}
        error={fieldErrorOf(props.screen, props.notice)}
        onAsk={props.onAsk}
      />
    </Root>
  );
}
