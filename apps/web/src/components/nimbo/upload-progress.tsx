import { formatBytes } from '@nimbo/contracts';
import * as React from 'react';

import { cn } from '../../lib/utils';

/** La velocidad es la media de lo enviado en esta ventana (RN-3). */
export const SPEED_WINDOW_MS = 5_000;

const SECONDS_BEFORE_MINUTES = 120;

export interface ProgressSample {
  readonly atMs: number;
  readonly loadedBytes: number;
}

export interface UploadProgressInput {
  readonly loadedBytes: number;
  readonly sizeBytes: number;
  readonly samples: readonly ProgressSample[];
  readonly nowMs: number;
}

export interface UploadProgressStats {
  readonly percent: number;
  readonly loadedLabel: string;
  readonly totalLabel: string;
  readonly bytesPerSecond: number;
  readonly speedLabel: string | null;
  readonly secondsRemaining: number | null;
  readonly remainingLabel: string | null;
}

function percentOf(loadedBytes: number, sizeBytes: number): number {
  if (sizeBytes <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((loadedBytes / sizeBytes) * 100)));
}

function averageSpeed({ loadedBytes, samples, nowMs }: UploadProgressInput): number {
  const oldest = samples.find(
    (sample) => sample.atMs >= nowMs - SPEED_WINDOW_MS && sample.atMs < nowMs,
  );
  if (!oldest) return 0;
  const speed = ((loadedBytes - oldest.loadedBytes) * 1000) / (nowMs - oldest.atMs);
  return Math.max(0, speed);
}

function remainingLabelOf(seconds: number): string {
  return seconds < SECONDS_BEFORE_MINUTES
    ? `quedan ${seconds} s`
    : `quedan ${Math.ceil(seconds / 60)} min`;
}

/** Progreso medido en el navegador: porcentaje, bytes, velocidad y tiempo restante (CA-21). */
export function computeUploadProgress(input: UploadProgressInput): UploadProgressStats {
  const bytesPerSecond = averageSpeed(input);
  const pending = Math.max(0, input.sizeBytes - input.loadedBytes);
  const secondsRemaining = bytesPerSecond > 0 ? Math.ceil(pending / bytesPerSecond) : null;
  return {
    percent: percentOf(input.loadedBytes, input.sizeBytes),
    loadedLabel: formatBytes(input.loadedBytes),
    totalLabel: formatBytes(input.sizeBytes),
    bytesPerSecond,
    speedLabel: bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : null,
    secondsRemaining,
    remainingLabel: secondsRemaining === null ? null : remainingLabelOf(secondsRemaining),
  };
}

export interface UploadProgressProps extends UploadProgressInput {
  readonly label: string;
  readonly className?: string;
}

export function UploadProgress({
  label,
  className,
  ...input
}: UploadProgressProps): React.JSX.Element {
  const stats = computeUploadProgress(input);
  const bytes = `${stats.loadedLabel} de ${stats.totalLabel}`;
  const details = [`${stats.percent} %`, bytes, stats.speedLabel, stats.remainingLabel].filter(
    (part): part is string => part !== null,
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stats.percent}
        aria-valuetext={`${stats.percent} %, ${bytes}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${stats.percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{details.join(' · ')}</p>
    </div>
  );
}
