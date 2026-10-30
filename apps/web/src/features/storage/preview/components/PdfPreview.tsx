'use client';

import * as React from 'react';

import { useLatestCallbacks } from '../hooks/use-latest-callbacks';
import { readerFailure, type PreviewFailure } from '../preview-failure';
import type { ReaderEvents } from '../reader-events';
import {
  openPdfSession,
  PdfReadError,
  type PdfRuntime,
  type PdfSession,
} from '../readers/pdfjs-adapter';

import styles from './PdfPreview.module.css';
import { EmptyFileNotice, UnitNavigation } from './ReaderNavigation';

type PdfPreviewProps = ReaderEvents & {
  readonly url: string;
  readonly onFailure: (failure: PreviewFailure) => void;
};
type PdfAttempt = {
  readonly controller: AbortController;
  readonly fail: (failure: PreviewFailure) => void;
  readonly ready: () => void;
  active: boolean;
  runtime?: PdfRuntime;
  session?: PdfSession;
  opening?: Promise<PdfSession>;
  cleanup?: Promise<void>;
};
type LoadedPdf = { readonly session: PdfSession; readonly attempt: PdfAttempt };

function disposeAttempt(attempt: PdfAttempt): Promise<void> {
  if (attempt.cleanup !== undefined) return attempt.cleanup;
  attempt.active = false;
  attempt.controller.abort();
  attempt.cleanup = (async () => {
    const session = attempt.session ?? (await attempt.opening?.catch(() => undefined));
    await session?.dispose();
    attempt.runtime?.dispose();
  })();
  return attempt.cleanup;
}

async function loadPdf(
  url: string,
  attempt: PdfAttempt,
  publish: (loaded: LoadedPdf) => void,
): Promise<void> {
  try {
    const { createPdfRuntime } = await import('../readers/pdfjs-runtime');
    const runtime = await createPdfRuntime(attempt.controller.signal, attempt.fail);
    attempt.runtime = runtime;
    if (!attempt.active) {
      runtime.dispose();
      return;
    }
    attempt.opening = openPdfSession({
      url,
      runtime,
      signal: attempt.controller.signal,
      onFailure: attempt.fail,
    });
    const session = await attempt.opening;
    attempt.session = session;
    if (!attempt.active) {
      await disposeAttempt(attempt);
      return;
    }
    publish({ session, attempt });
  } catch (error) {
    attempt.fail(readerFailure(error instanceof PdfReadError ? error.reason : 'unavailable'));
  }
}

function usePdfReading({
  url,
  onFailure,
  onReady,
  registerCleanup,
}: PdfPreviewProps): LoadedPdf | null {
  const [loaded, setLoaded] = React.useState<LoadedPdf | null>(null);
  const callbacks = useLatestCallbacks({ onFailure, onReady });
  React.useEffect(() => {
    const attempt: PdfAttempt = {
      controller: new AbortController(),
      active: true,
      fail: (failure) => {
        if (!attempt.active) return;
        void disposeAttempt(attempt);
        setLoaded(null);
        callbacks.current.onFailure(readerFailure(failure.reason));
      },
      ready: () => {
        if (attempt.active) callbacks.current.onReady?.();
      },
    };
    const unregister = registerCleanup?.(() => disposeAttempt(attempt));
    void loadPdf(url, attempt, setLoaded);
    return () => {
      unregister?.();
      void disposeAttempt(attempt);
    };
  }, [url, registerCleanup, callbacks]);
  return loaded;
}

type PdfCanvasProps = LoadedPdf & { readonly pageNumber: number };

function usePdfPage({ session, attempt, pageNumber }: PdfCanvasProps) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const textLayer = React.useRef<HTMLDivElement>(null);
  const literalText = React.useRef<HTMLDivElement>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (canvas.current === null || textLayer.current === null || literalText.current === null)
      return;
    const controller = new AbortController();
    void session
      .renderPage({
        canvas: canvas.current,
        textLayer: textLayer.current,
        literalText: literalText.current,
        pageNumber,
        signal: controller.signal,
      })
      .then(() => {
        if (controller.signal.aborted || !attempt.active) return;
        setReady(true);
        attempt.ready();
      })
      .catch(() => {
        if (!controller.signal.aborted) attempt.fail(readerFailure('unavailable'));
      });
    return () => controller.abort();
  }, [session, attempt, pageNumber]);
  return { canvas, textLayer, literalText, ready };
}

function PdfCanvas(props: PdfCanvasProps): React.JSX.Element {
  const { canvas, textLayer, literalText, ready } = usePdfPage(props);
  const { pageNumber } = props;
  return (
    <div role="group" aria-label={`Página ${pageNumber}`} aria-busy={!ready} data-pdf-page="">
      {!ready ? <p role="status">Preparando página…</p> : null}
      <div
        className={
          ready
            ? 'relative mx-auto w-fit max-w-full'
            : 'invisible relative mx-auto w-fit max-w-full'
        }
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Página ${pageNumber} del PDF`}
          aria-hidden={!ready}
          className="block h-auto max-w-full"
        />
        <div ref={textLayer} className={styles.textLayer} aria-hidden="true" />
      </div>
      <div
        ref={literalText}
        role="group"
        aria-label="Texto de la página"
        hidden={!ready}
        // La TextLayer transparente ya permite seleccionar; este bloque completo es para lectores de pantalla.
        className="sr-only"
      />
    </div>
  );
}

function PdfPages(loaded: LoadedPdf): React.JSX.Element {
  const [page, setPage] = React.useState(1);
  return (
    <div className="space-y-4">
      <UnitNavigation
        label="Páginas del PDF"
        status={`Página ${page} de ${loaded.session.numPages}`}
        hasPrevious={page > 1}
        hasNext={page < loaded.session.numPages}
        previous={() => setPage((current) => current - 1)}
        next={() => setPage((current) => current + 1)}
      />
      <PdfCanvas key={page} {...loaded} pageNumber={page} />
    </div>
  );
}

function EmptyPdf({ attempt }: LoadedPdf): React.JSX.Element {
  React.useEffect(() => {
    attempt.ready();
  }, [attempt]);
  return <EmptyFileNotice />;
}

function PdfReading(props: PdfPreviewProps): React.JSX.Element | null {
  const loaded = usePdfReading(props);
  if (loaded === null) return null;
  return loaded.session.numPages === 0 ? <EmptyPdf {...loaded} /> : <PdfPages {...loaded} />;
}

export function PdfPreview(props: PdfPreviewProps): React.JSX.Element {
  return <PdfReading key={props.url} {...props} />;
}
