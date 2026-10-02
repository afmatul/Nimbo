import { formatBytes } from '@nimbo/contracts';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { cn } from '../../lib/utils';

/** Tramos de `QuotaBar` (`ui-guidelines.md` §4, RN-4): no se inventan umbrales. */
export const QUOTA_WARNING_PERCENT = 70;
export const QUOTA_CRITICAL_PERCENT = 90;
export const QUOTA_FULL_PERCENT = 100;

export type QuotaTier = 'normal' | 'warning' | 'critical' | 'full';

interface TierStyle {
  readonly fill: string;
  readonly notice: string;
  readonly icon: React.ComponentType<{ className?: string }> | null;
}

const TIER_STYLES: Readonly<Record<QuotaTier, TierStyle>> = {
  normal: { fill: 'bg-success', notice: '', icon: null },
  warning: { fill: 'bg-warning', notice: 'text-warning-foreground', icon: TriangleAlert },
  critical: { fill: 'bg-destructive-soft', notice: 'text-destructive', icon: CircleAlert },
  full: { fill: 'bg-destructive-soft', notice: 'text-destructive', icon: CircleAlert },
};

/** Porcentaje entero usado, hacia abajo para no anunciar un tramo antes de tiempo. Sin cuota no queda espacio. */
export function quotaPercentOf(usedBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) return QUOTA_FULL_PERCENT;
  const percent = Math.floor((usedBytes / quotaBytes) * 100);
  return Math.min(QUOTA_FULL_PERCENT, Math.max(0, percent));
}

export function quotaTierOf(percent: number): QuotaTier {
  if (percent >= QUOTA_FULL_PERCENT) return 'full';
  if (percent >= QUOTA_CRITICAL_PERCENT) return 'critical';
  if (percent >= QUOTA_WARNING_PERCENT) return 'warning';
  return 'normal';
}

/** Texto de aviso del tramo (spec 007 §6); `null` cuando hay espacio de sobra. */
export function quotaNoticeOf(percent: number): string | null {
  const notices: Readonly<Record<QuotaTier, string | null>> = {
    normal: null,
    warning: `Tu cuota está al ${percent} %.`,
    critical: 'Espacio casi agotado.',
    full: 'Espacio agotado.',
  };
  return notices[quotaTierOf(percent)];
}

export interface QuotaBarProps {
  readonly label: string;
  readonly usedBytes: number;
  readonly quotaBytes: number;
  /** Destino de «Liberar espacio» en los tramos de aviso; sin él no se muestra la acción. */
  readonly freeSpaceHref?: string;
  readonly className?: string;
}

interface QuotaNoticeProps {
  readonly percent: number;
  readonly freeSpaceHref: string | undefined;
}

/** Acción de texto junto al medidor («Liberar espacio», «Ver detalle»): subrayada, no solo por color. */
export function QuotaLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      className="inline-flex min-h-6 items-center rounded-sm text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

function QuotaNotice({ percent, freeSpaceHref }: QuotaNoticeProps): React.JSX.Element | null {
  const notice = quotaNoticeOf(percent);
  const style = TIER_STYLES[quotaTierOf(percent)];
  if (notice === null || style.icon === null) return null;
  const Icon = style.icon;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        data-quota-notice=""
        className={cn('flex items-start gap-1.5 text-xs font-medium', style.notice)}
      >
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{notice}</span>
      </p>
      {freeSpaceHref !== undefined && <QuotaLink href={freeSpaceHref}>Liberar espacio</QuotaLink>}
    </div>
  );
}

interface QuotaTrackProps {
  readonly label: string;
  readonly percent: number;
  readonly amounts: string;
}

/** Pista con borde `input` para llegar a ≥ 3:1 contra la tarjeta (D-19 a). */
function QuotaTrack({ label, percent, amounts }: QuotaTrackProps): React.JSX.Element {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={QUOTA_FULL_PERCENT}
      aria-valuenow={percent}
      aria-valuetext={`${amounts} (${percent} %)`}
      className="h-1.5 w-full overflow-hidden rounded-full border border-input bg-muted"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] motion-reduce:transition-none',
          TIER_STYLES[quotaTierOf(percent)].fill,
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Medidor de cuota (RF-12): porcentaje y GB siempre en texto; el color nunca va solo (CA-5, D-17, D-19). */
export function QuotaBar({
  label,
  usedBytes,
  quotaBytes,
  freeSpaceHref,
  className,
}: QuotaBarProps): React.JSX.Element {
  const percent = quotaPercentOf(usedBytes, quotaBytes);
  const amounts = `${formatBytes(usedBytes)} de ${formatBytes(quotaBytes)}`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs font-semibold tabular-nums">
        <span>{label}</span>
        <span>{percent} %</span>
      </div>
      <QuotaTrack label={label} percent={percent} amounts={amounts} />
      <p className="text-xs font-medium text-muted-foreground tabular-nums">{amounts}</p>
      <QuotaNotice percent={percent} freeSpaceHref={freeSpaceHref} />
    </div>
  );
}
