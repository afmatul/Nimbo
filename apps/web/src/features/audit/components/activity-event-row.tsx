import type { AuditEventResponse } from '@nimbo/contracts';
import {
  Activity,
  CircleX,
  Download,
  FileX,
  Headset,
  MessageSquareText,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  User,
  type LucideIcon,
} from 'lucide-react';
import type * as React from 'react';

import { cn } from '../../../lib/utils';
import { activityActionLabel, activityActorLabel, activityResourceLabel } from '../activity-labels';

const ACTION_ICONS: Readonly<Record<string, LucideIcon>> = {
  'file.upload_completed': Upload,
  'file.upload_rejected': FileX,
  'file.download_url_issued': Download,
  'node.trashed': Trash2,
  'node.restored': Undo2,
  'node.purged': CircleX,
  'trash.emptied': Trash2,
};

/** «5 oct 2026», «30 sept 2026» y la hora local en 24 h, como las fechas de 002 y 006. */
const dateFormatter = new Intl.DateTimeFormat('es-GT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('es-GT', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function isInternal(event: AuditEventResponse): boolean {
  return event.origin === 'staff';
}

/** Ícono de la acción: relleno en las internas, claro en las propias (no es la única diferencia, CA-13). */
function ActionTile({ event }: { readonly event: AuditEventResponse }): React.JSX.Element {
  const Icon = ACTION_ICONS[event.action] ?? Activity;
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
        isInternal(event)
          ? 'bg-primary-hover text-primary-foreground'
          : 'bg-brand/12 text-primary-hover',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function EventTime({ occurredAt }: { readonly occurredAt: string }): React.JSX.Element {
  const date = new Date(occurredAt);
  return (
    <time
      dateTime={occurredAt}
      className="order-first text-xs tabular-nums text-muted-foreground sm:order-last sm:text-right"
    >
      <span className="font-semibold text-foreground">{dateFormatter.format(date)}</span>
      {' · '}
      {timeFormatter.format(date)}
    </time>
  );
}

function InternalBadge(): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-brand/12 px-1.5 py-0.5 text-xs font-semibold text-primary-hover">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      Acción interna
    </span>
  );
}

/** Origen por rol, nunca nombre ni correo (D-2); recurso como tipo y cantidad (D-3). */
function EventMeta({ event }: { readonly event: AuditEventResponse }): React.JSX.Element {
  const OriginIcon = isInternal(event) ? Headset : User;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-foreground">
      {isInternal(event) ? <InternalBadge /> : null}
      <span className="inline-flex items-center gap-1">
        <OriginIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Origen: <b className="font-semibold text-foreground">{activityActorLabel(event)}</b>
        </span>
      </span>
      <span className="tabular-nums">{activityResourceLabel(event)}</span>
    </div>
  );
}

/** Motivo que escribió el personal (RN-6, ≤ 500 caracteres); corta palabras largas sin desbordar a 360 px. */
function ReasonNote({
  actor,
  note,
}: {
  readonly actor: string;
  readonly note: string;
}): React.JSX.Element {
  const label = `Motivo escrito por ${actor}`;
  return (
    <div
      role="note"
      aria-label={label}
      className="mt-2.5 rounded-md border border-border bg-card px-3 py-2 text-sm"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-secondary-foreground">
        <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 wrap-anywhere text-foreground">{note}</p>
    </div>
  );
}

/**
 * Una fila de «Mi actividad» (CA-7, CA-13): acción en español, origen, recurso y fecha. Las acciones internas se
 * distinguen por el distintivo «Acción interna», la franja izquierda, el ícono relleno y el ícono del origen; si traen
 * `note`, el bloque del motivo. No hay forma de ocultarlas.
 */
export function ActivityEventRow({
  event,
}: {
  readonly event: AuditEventResponse;
}): React.JSX.Element {
  return (
    <li
      className={cn(
        'flex gap-3 border-b border-border px-4 py-3.5 last:border-b-0',
        isInternal(event) && 'border-l-[3px] border-l-primary-hover pl-3.5',
      )}
    >
      <ActionTile event={event} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{activityActionLabel(event)}</p>
          <EventMeta event={event} />
          {event.note === undefined ? null : (
            <ReasonNote actor={activityActorLabel(event)} note={event.note} />
          )}
        </div>
        <EventTime occurredAt={event.occurredAt} />
      </div>
    </li>
  );
}
