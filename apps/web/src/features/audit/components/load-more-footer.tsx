'use client';

import { CircleAlert, CircleCheck, Loader2, RotateCw } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import type { MoreStatus } from '../../storage/hooks/use-folder-contents';

export interface LoadMoreFooterProps {
  readonly status: MoreStatus;
  readonly hasMore: boolean;
  /** Pide la página siguiente; tras un error, la reintenta. */
  readonly onLoadMore: () => void;
}

function EndNote(): React.JSX.Element {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <CircleCheck className="h-4 w-4 shrink-0 text-success-foreground" aria-hidden="true" />
      Llegaste al final: no hay actividad más antigua.
    </p>
  );
}

function LoadMoreError({ onRetry }: { readonly onRetry: () => void }): React.JSX.Element {
  return (
    <Alert variant="error" className="flex w-full flex-wrap items-start gap-3">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-foreground">
        <strong className="text-destructive">No pudimos cargar más actividad.</strong> Intenta de
        nuevo; lo que ya ves no cambió.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Reintentar
      </Button>
    </Alert>
  );
}

/** Mientras carga queda `aria-disabled` (conserva el foco) y no vuelve a pedir. */
function LoadMoreButton({
  loading,
  onLoadMore,
}: {
  readonly loading: boolean;
  readonly onLoadMore: () => void;
}): React.JSX.Element {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-disabled={loading || undefined}
        className="w-full text-foreground aria-disabled:cursor-progress sm:w-auto"
        onClick={loading ? undefined : onLoadMore}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : null}
        {loading ? 'Cargando más…' : 'Cargar más'}
      </Button>
      <span role="status" className="sr-only">
        {loading ? 'Cargando más actividad…' : ''}
      </span>
    </>
  );
}

/**
 * Pie de la lista de «Mi actividad» (mockups `cargando-mas`, `cargar-mas-error`, `fin-de-lista`; CA-9, CA-15): «Cargar
 * más», «Cargando más…», el error con «Reintentar» sin perder lo visible y el fin de la lista.
 */
export function LoadMoreFooter({
  status,
  hasMore,
  onLoadMore,
}: LoadMoreFooterProps): React.JSX.Element {
  if (!hasMore) return <EndNote />;
  return (
    <div className="flex flex-col items-center gap-2">
      {status === 'error' ? (
        <LoadMoreError onRetry={onLoadMore} />
      ) : (
        <LoadMoreButton loading={status === 'loading'} onLoadMore={onLoadMore} />
      )}
    </div>
  );
}
