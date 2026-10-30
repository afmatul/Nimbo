'use client';

import type { IndexingStatusResponse } from '@nimbo/contracts';
import { CircleAlert, Info, Loader2, RotateCw } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import type { RetryControl } from '../hooks/use-indexing-status';
import {
  indexingNoticeOf,
  type IndexingNotice,
  type IndexingNoticeTone,
} from '../indexing-messages';

const SPINNING = 'animate-spin motion-reduce:animate-none';

const TONE_CLASS: Record<IndexingNoticeTone, string> = {
  info: 'border-border bg-card shadow-card',
  error: 'border-destructive-soft/45 bg-destructive-soft/12',
};

const TITLE_CLASS: Record<IndexingNoticeTone, string> = {
  info: 'text-foreground',
  error: 'text-destructive',
};

export interface IndexingBannerProps {
  readonly status: IndexingStatusResponse | null;
  readonly retry: RetryControl;
}

/**
 * Aviso del estado de indexación entre el encabezado y las tarjetas de la ficha (019 CA-4, CA-5, CA-7, CA-12 a CA-14).
 * El contenedor `role="status"` existe siempre, también vacío, y el contenido cambia dentro de él: el aviso en vivo se
 * anuncia sin mover el foco. Tras reintentar con éxito, «Reintentar» desaparece y el foco pasa al contenedor.
 */
export function IndexingBanner({ status, retry }: IndexingBannerProps): React.JSX.Element {
  const region = React.useRef<HTMLDivElement>(null);
  const notice = status ? indexingNoticeOf(status, retry.failed) : null;
  const onRetry = async (): Promise<void> => {
    if (retry.pending) return;
    if (await retry.run()) region.current?.focus();
  };
  return (
    <div
      ref={region}
      role="status"
      tabIndex={-1}
      className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {notice ? (
        <NoticeCard notice={notice}>
          {status?.canRetry ? <RetryButton pending={retry.pending} onRetry={onRetry} /> : null}
        </NoticeCard>
      ) : null}
      <span className="sr-only">{retry.pending ? 'Reintentando la indexación…' : ''}</span>
    </div>
  );
}

function NoticeIcon({ notice }: { readonly notice: IndexingNotice }): React.JSX.Element {
  const iconClass = 'mt-0.5 h-5 w-5 shrink-0';
  if (notice.tone === 'error') {
    return <CircleAlert className={cn(iconClass, 'text-destructive')} aria-hidden="true" />;
  }
  if (notice.inProgress) {
    return <Loader2 className={cn(iconClass, 'text-primary', SPINNING)} aria-hidden="true" />;
  }
  return <Info className={cn(iconClass, 'text-primary')} aria-hidden="true" />;
}

function NoticeCard({
  notice,
  children,
}: {
  readonly notice: IndexingNotice;
  /** La acción del aviso, si la hay. */
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center',
        TONE_CLASS[notice.tone],
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <NoticeIcon notice={notice} />
        <div className="min-w-0 text-sm">
          <p className={cn('font-semibold', TITLE_CLASS[notice.tone])}>{notice.title}</p>
          <p className="mt-0.5 text-foreground">{notice.text}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** «Reintentar» (CA-13): mientras responde dice «Reintentando…» con `aria-disabled` y sigue enfocable. */
function RetryButton({
  pending,
  onRetry,
}: {
  readonly pending: boolean;
  readonly onRetry: () => Promise<void>;
}): React.JSX.Element {
  const Icon = pending ? Loader2 : RotateCw;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-11 w-full shrink-0 sm:h-9 sm:w-auto"
      aria-disabled={pending || undefined}
      onClick={() => void onRetry()}
    >
      <Icon className={cn('h-4 w-4', pending && SPINNING)} aria-hidden="true" />
      {pending ? 'Reintentando…' : 'Reintentar'}
    </Button>
  );
}
