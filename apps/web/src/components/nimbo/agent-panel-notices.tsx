import type { AgentStatusResponse } from '@nimbo/contracts';
import { CircleAlert, CloudOff, Lock, RotateCcw, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { dayMonthLabel } from '../../lib/format-date';
import { Alert } from '../ui/alert';
import { Button, buttonVariants } from '../ui/button';

import type { ComposerLock } from './agent-panel-composer';
import { NotFoundNotice } from './agent-panel-states';

/**
 * Estados de pantalla del panel, con los nombres del mockup `intelligence/panel-agente/` (los deriva la sesión del
 * agente). El panel no importa de `features`: el tipo es su contrato de props.
 */
export type AgentPanelScreen =
  | 'cargando'
  | 'inicio'
  | 'vacio'
  | 'respondiendo'
  | 'con-citas'
  | 'cita-incierta'
  | 'sin-resultados'
  | 'detenido'
  | 'limite-alcanzado'
  | 'no-disponible'
  | 'no-disponible-parcial'
  | 'error-pregunta'
  | 'error-pregunta-vacia'
  | 'ambito-no-disponible'
  | 'error';

/**
 * Mensaje de un fallo ya resuelto por el catálogo (`agentMessage`, `messageForCode`): qué pasó y qué hacer. Con la
 * cuota agotada trae además su salida: «Ver planes» (`CHANGE_PLAN_PATH`) o, en solo lectura sin fecha, «Renovar plan»
 * (`RENEW_PATH`), según elija quien monta el panel (CA-8, RN-5).
 */
export interface AgentPanelNotice {
  readonly cause: string;
  readonly fix: string;
  readonly link?: { readonly label: 'Ver planes' | 'Renovar plan'; readonly href: string };
}

/** Estados en los que el aviso va en el propio campo, no en la conversación (CA-7). */
const FIELD_ERROR_SCREENS: ReadonlySet<AgentPanelScreen> = new Set([
  'error-pregunta',
  'error-pregunta-vacia',
]);

/** Texto del error del campo (CA-7), o `null` si el estado no es de pregunta inválida. */
export function fieldErrorOf(
  screen: AgentPanelScreen,
  notice: AgentPanelNotice | null,
): string | null {
  if (notice === null || !FIELD_ERROR_SCREENS.has(screen)) return null;
  return `${notice.cause} ${notice.fix}`;
}

const RESPONDING_LOCK: ComposerLock = {
  placeholder: 'Esperando la respuesta…',
  reason: 'Escribiendo… Podrás preguntar de nuevo cuando termine.',
};

/** Cuota agotada (CA-8): la fecha de renovación o, en solo lectura sin fecha (RN-5), la salida de renovar. */
function quotaLock(status: AgentStatusResponse | null): ComposerLock {
  const resetsAt = status?.resetsAt ?? null;
  return {
    placeholder: 'Sin consultas disponibles',
    reason:
      resetsAt === null
        ? 'Podrás preguntar de nuevo cuando renueves tu plan.'
        : `Podrás preguntar de nuevo el ${dayMonthLabel(resetsAt)}.`,
  };
}

/** Campo apagado por estado (CA-3, CA-8); `null` con el campo activo. */
export function composerLockOf(
  screen: AgentPanelScreen,
  status: AgentStatusResponse | null,
): ComposerLock | null {
  if (screen === 'respondiendo') return RESPONDING_LOCK;
  if (screen === 'limite-alcanzado') return quotaLock(status);
  return null;
}

interface NoticeAlertProps {
  readonly notice: AgentPanelNotice;
  readonly variant: 'warning' | 'error';
  readonly icon: LucideIcon;
  readonly children?: React.ReactNode;
}

/** Aviso con título y corrección sobre una tarjeta clara: los tonos al 10 % solo son AA sobre `card`. */
function NoticeAlert({
  notice,
  variant,
  icon: Icon,
  children,
}: NoticeAlertProps): React.JSX.Element {
  return (
    <div className="rounded-md bg-card">
      <Alert variant={variant} className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="font-semibold">{notice.cause}</p>
          <p className="text-foreground">{notice.fix}</p>
          {children !== undefined && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
        </div>
      </Alert>
    </div>
  );
}

/** `limite-alcanzado` (CA-8): aviso, no error, con «Ver planes» o «Renovar plan». */
function QuotaNotice({ notice }: { readonly notice: AgentPanelNotice }): React.JSX.Element {
  return (
    <NoticeAlert notice={notice} variant="warning" icon={Lock}>
      {notice.link !== undefined && (
        <Link href={notice.link.href} className={buttonVariants({ size: 'sm' })}>
          {notice.link.label}
        </Link>
      )}
    </NoticeAlert>
  );
}

interface ScreenNoticeProps {
  readonly screen: AgentPanelScreen;
  readonly notice: AgentPanelNotice | null;
  readonly onRetry: () => void;
}

/** `no-disponible` y su variante parcial (CA-9): lo recibido queda arriba y «Reintentar» vuelve a preguntar. */
function UnavailableNotice({
  notice,
  onRetry,
}: Omit<ScreenNoticeProps, 'screen'> & { readonly notice: AgentPanelNotice }): React.JSX.Element {
  return (
    <NoticeAlert notice={notice} variant="error" icon={CloudOff}>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Reintentar
      </Button>
    </NoticeAlert>
  );
}

/** Aviso tras la conversación según el estado (CA-5, CA-8, CA-9, CA-16). Los errores del campo van en él (CA-7). */
export function ScreenNotice({
  screen,
  notice,
  onRetry,
}: ScreenNoticeProps): React.JSX.Element | null {
  if (screen === 'sin-resultados') return <NotFoundNotice />;
  if (notice === null) return null;
  switch (screen) {
    case 'limite-alcanzado':
      return <QuotaNotice notice={notice} />;
    case 'no-disponible':
    case 'no-disponible-parcial':
      return <UnavailableNotice notice={notice} onRetry={onRetry} />;
    case 'ambito-no-disponible':
    case 'error':
      return <NoticeAlert notice={notice} variant="error" icon={CircleAlert} />;
    default:
      return null;
  }
}
