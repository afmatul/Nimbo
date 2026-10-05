import type { DeviceKind, SessionSummary } from '@nimbo/contracts';
import { Check, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ACTIVE_NOW_LABEL, lastActivityLabel, startedOnLabel } from '../../../lib/format-date';
import { cn } from '../../../lib/utils';

/** Tono de marca del mockup para el ícono y «Este dispositivo» (`primary-hover` sobre `brand`, AA). */
const BRAND_TINT = 'bg-brand/10 text-primary-hover';

const DEVICE_ICONS: Readonly<Record<DeviceKind, LucideIcon>> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

export interface SessionRowProps {
  readonly session: SessionSummary;
  /** Instante de referencia para «Última actividad: hace …». */
  readonly now: number;
  readonly onRevoke: (session: SessionSummary) => void;
}

/** «Safari · iOS»: lo que la persona reconoce de la sesión (D-9). */
export function deviceLabel(session: SessionSummary): string {
  return `${session.browser} · ${session.os}`;
}

function DeviceIcon({ kind }: { readonly kind: DeviceKind }): React.JSX.Element {
  const Icon = DEVICE_ICONS[kind];
  return (
    <span
      className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', BRAND_TINT)}
    >
      <Icon data-device-icon="" aria-hidden="true" className="h-5 w-5" />
    </span>
  );
}

function SessionName({ session }: { readonly session: SessionSummary }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
      <span>{deviceLabel(session)}</span>
      {session.current && (
        <Badge variant="outline" className={cn('gap-1 border-transparent', BRAND_TINT)}>
          <Check aria-hidden="true" className="h-3 w-3" />
          Este dispositivo
        </Badge>
      )}
    </div>
  );
}

/** Una sesión de «Seguridad»: navegador · sistema, actividad, inicio y su botón de cierre (CA-11). */
export function SessionRow({ session, now, onRevoke }: SessionRowProps): React.JSX.Element {
  const activity = session.current
    ? ACTIVE_NOW_LABEL
    : lastActivityLabel(session.lastActiveAt, now);
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md border border-border p-3 sm:flex-nowrap',
        session.current && 'bg-background',
      )}
    >
      <DeviceIcon kind={session.deviceKind} />
      <div className="min-w-0 flex-1">
        <SessionName session={session} />
        <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums">
          <span>{activity}</span>
          <span>{startedOnLabel(session.startedAt)}</span>
        </p>
      </div>
      <Button variant="outline" type="button" onClick={() => onRevoke(session)}>
        Cerrar sesión
        <span className="sr-only">
          {session.current ? ' en este dispositivo' : ` en ${deviceLabel(session)}`}
        </span>
      </Button>
    </li>
  );
}
