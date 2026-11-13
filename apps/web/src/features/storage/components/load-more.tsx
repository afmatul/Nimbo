'use client';

import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import type { MoreStatus } from '../hooks/use-folder-contents';

import { DownloadNoticeBanner } from './file-row-menu';

export interface LoadMoreProps {
  readonly status: MoreStatus;
  readonly hasMore: boolean;
  /** Elementos que agregó la última página (0 si aún no se pidió ninguna). */
  readonly added: number;
  readonly placeName: string;
  readonly onLoadMore: () => void;
  readonly onDismissError: () => void;
  /** Texto del botón; por defecto «Cargar más» (las tarjetas dicen «Mostrar más»). */
  readonly label?: string;
}

const LOAD_MORE_ERROR = {
  title: 'No pudimos cargar más elementos.',
  description: 'Revisa tu conexión e inténtalo de nuevo. Lo que ya ves sigue aquí.',
  actionLabel: 'Reintentar',
} as const;

function announcement({ status, added, placeName }: LoadMoreProps): string {
  if (status === 'loading') return `Cargando más elementos de ${placeName}…`;
  if (status === 'error' || added === 0) return '';
  return added === 1 ? 'Se cargó 1 elemento más.' : `Se cargaron ${String(added)} elementos más.`;
}

/** Mientras carga queda `aria-disabled` (conserva el foco) y no vuelve a pedir. */
function LoadMoreButton({
  loading,
  label,
  onLoadMore,
}: {
  readonly loading: boolean;
  readonly label: string;
  readonly onLoadMore: () => void;
}): React.JSX.Element {
  return (
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
      {loading ? 'Cargando más…' : label}
    </Button>
  );
}

/**
 * «Cargar más» debajo de la lista (mockups `mas-paginas`, `cargando-mas`, `cargar-mas-error`; CA-9, CA-12): sin total ni
 * números de página. Mientras carga, el botón queda `aria-disabled` y conserva el foco; si falla, lo reemplaza un aviso
 * con «Reintentar». La región de estado sigue montada aunque ya no haya más páginas, para anunciar la última.
 */
export function LoadMore(props: LoadMoreProps): React.JSX.Element {
  const { status, hasMore, onLoadMore, onDismissError, label = 'Cargar más' } = props;
  return (
    <div className="flex flex-col items-center gap-2">
      {status === 'error' ? (
        <div className="w-full">
          <DownloadNoticeBanner
            notice={{ ...LOAD_MORE_ERROR, onAction: onLoadMore }}
            onDismiss={onDismissError}
          />
        </div>
      ) : null}
      {status !== 'error' && hasMore ? (
        <LoadMoreButton loading={status === 'loading'} label={label} onLoadMore={onLoadMore} />
      ) : null}
      <p role="status" className="sr-only">
        {announcement(props)}
      </p>
    </div>
  );
}
