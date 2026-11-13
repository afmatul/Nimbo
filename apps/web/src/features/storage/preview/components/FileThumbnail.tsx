'use client';

import type { FileSummary } from '@nimbo/contracts';
import * as React from 'react';

import { cn } from '../../../../lib/utils';
import { useAuthFetch } from '../../../identity/session/use-auth-fetch';
import { requestPreviewUrl, type PreviewUrlRequester } from '../api';
import { usePreview } from '../hooks/use-preview';
import { acquireThumbnailSlot } from '../thumbnail-queue';

import { PreviewReader } from './PreviewReader';

/** Solo imágenes y PDF (primera página); el resto conserva el ícono. Más allá de este tamaño no vale la pena leerlo. */
const THUMBNAIL_KINDS: ReadonlySet<FileSummary['kind']> = new Set(['imagen', 'pdf']);
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;

export function hasThumbnail(file: FileSummary): boolean {
  return THUMBNAIL_KINDS.has(file.kind) && file.sizeBytes <= MAX_THUMBNAIL_BYTES;
}

/** Verdadero cuando el elemento entra (o está por entrar) en pantalla; una sola vez. Sin `IntersectionObserver`, nunca. */
function useNearViewport(element: HTMLElement | null): boolean {
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    if (element === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: '150px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return near;
}

/** Turno en la cola global de miniaturas; se libera al terminar o al desmontar. */
function useThumbnailTurn(): { readonly granted: boolean; readonly release: () => void } {
  const [granted, setGranted] = React.useState(false);
  const releaseRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    void acquireThumbnailSlot(controller.signal).then((release) => {
      if (release === null) return;
      releaseRef.current = release;
      setGranted(true);
    });
    return () => {
      controller.abort();
      releaseRef.current?.();
    };
  }, []);
  const release = React.useCallback(() => releaseRef.current?.(), []);
  return { granted, release };
}

type LoaderProps = { readonly file: FileSummary; readonly apiPublicUrl: string };

function useThumbnailRequest(apiPublicUrl: string): PreviewUrlRequester {
  const authFetch = useAuthFetch();
  return React.useCallback(
    (fileId: string, signal: AbortSignal) =>
      requestPreviewUrl(apiPublicUrl, authFetch, { fileId, signal }),
    [apiPublicUrl, authFetch],
  );
}

const READER_CLASS = cn(
  'absolute inset-0 bg-card transition-opacity motion-reduce:transition-none',
  '[&_[aria-label="Páginas del PDF"]]:hidden [&_[role=status]]:hidden',
  '[&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_canvas]:w-full',
);

/** Pide la URL de vista (mismo endpoint y aislamiento que la 017) y deja que el lector dibuje la miniatura. */
function ThumbnailReading({
  file,
  apiPublicUrl,
  release,
}: LoaderProps & { readonly release: () => void }): React.JSX.Element | null {
  const { state } = usePreview(file.id, useThumbnailRequest(apiPublicUrl));
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const onReady = React.useCallback(() => {
    setReady(true);
    release();
  }, [release]);
  const onFailure = React.useCallback(() => {
    setFailed(true);
    release();
  }, [release]);
  React.useEffect(() => {
    if (state.status === 'failure') release();
  }, [state.status, release]);
  if (state.status !== 'success' || failed) return null;
  return (
    <div className={cn(READER_CLASS, ready ? 'opacity-100' : 'opacity-0')}>
      <PreviewReader
        kind={file.kind}
        url={state.delivery.url}
        onFailure={onFailure}
        onReady={onReady}
      />
    </div>
  );
}

function ThumbnailLoader(props: LoaderProps): React.JSX.Element | null {
  const { granted, release } = useThumbnailTurn();
  return granted ? <ThumbnailReading {...props} release={release} /> : null;
}

/**
 * Miniatura real de la tarjeta (imagen o primera página del PDF), cargada solo cuando la tarjeta está cerca de la
 * pantalla y de a pocas a la vez. Decorativa: si falla o no aplica, la tarjeta conserva su ícono.
 */
export function FileThumbnail({ file, apiPublicUrl }: LoaderProps): React.JSX.Element | null {
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const near = useNearViewport(box);
  if (!hasThumbnail(file)) return null;
  return (
    <div
      ref={setBox}
      aria-hidden="true"
      inert
      className="absolute inset-0 overflow-hidden rounded-md"
    >
      {near ? <ThumbnailLoader file={file} apiPublicUrl={apiPublicUrl} /> : null}
    </div>
  );
}
