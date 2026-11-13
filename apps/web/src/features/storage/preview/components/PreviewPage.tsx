'use client';

import { formatBytes, type DownloadUrlResponse, type FileSummary } from '@nimbo/contracts';
import { ArrowLeft, Download, Eye, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { CHIP_TYPE_BY_KIND, returnPathOf, useFileDownload } from '../..';
import { FileTypeChip } from '../../../../components/nimbo/file-type-chip';
import { Alert } from '../../../../components/ui/alert';
import { Button, buttonVariants } from '../../../../components/ui/button';
import { messageForCode } from '../../../../lib/error-catalog';
import { DATE_LOCALE } from '../../../../lib/format-date';
import { cn } from '../../../../lib/utils';
import { useAuthFetch } from '../../../identity/session/use-auth-fetch';
import { requestPreviewUrl, type PreviewUrlRequester } from '../api';
import { usePreview, type PreviewState } from '../hooks/use-preview';
import { usePreviewContent } from '../hooks/use-preview-content';

import { PreviewReader } from './PreviewReader';
import { PreviewStates } from './PreviewStates';

export type PreviewPageProps = {
  readonly fileId: string;
  readonly apiPublicUrl: string;
  readonly openDownloadUrl?: (url: string) => void;
  /** Dentro de un diálogo (vista rápida): sin «Volver» ni título propio; el diálogo los aporta. */
  readonly embedded?: boolean;
};

const openInBrowser = (url: string): void => window.location.assign(url);

type DownloadAttempt = object;
type DownloadFlow = {
  readonly fileId: string;
  readonly request: (fileId: string) => Promise<DownloadUrlResponse>;
  readonly open: (url: string) => void;
  readonly active: React.RefObject<DownloadAttempt | undefined>;
  readonly setPending: (pending: boolean) => void;
  readonly setFailed: (failed: boolean) => void;
};

async function downloadFile(flow: DownloadFlow): Promise<void> {
  if (flow.active.current !== undefined) return;
  const attempt: DownloadAttempt = {};
  flow.active.current = attempt;
  flow.setFailed(false);
  flow.setPending(true);
  try {
    const { url } = await flow.request(flow.fileId);
    if (flow.active.current === attempt) flow.open(url);
  } catch {
    if (flow.active.current === attempt) flow.setFailed(true);
  } finally {
    if (flow.active.current === attempt) {
      flow.active.current = undefined;
      flow.setPending(false);
    }
  }
}

function usePreviewDownload(fileId: string, open: (url: string) => void) {
  const request = useFileDownload();
  const active = React.useRef<DownloadAttempt | undefined>(undefined);
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(
    () => () => {
      active.current = undefined;
    },
    [],
  );
  const reset = (): void => {
    active.current = undefined;
    setPending(false);
    setFailed(false);
  };
  const start = (): void => {
    void downloadFile({ fileId, request, open, active, setPending, setFailed });
  };
  return { pending, failed, start, reset };
}

function PreviewMetadata({ file }: { readonly file: FileSummary }): React.JSX.Element {
  const date = new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: 'medium' }).format(
    new Date(file.updatedAt),
  );
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <FileTypeChip fileType={CHIP_TYPE_BY_KIND[file.kind]} />
      <span className="tabular-nums">{formatBytes(file.sizeBytes)}</span>
      <time dateTime={file.updatedAt} className="tabular-nums">
        {date}
      </time>
      <span className="inline-flex items-center gap-1 text-secondary-foreground">
        <Eye className="h-4 w-4" aria-hidden="true" />
        Solo lectura
      </span>
    </div>
  );
}

/** `releasing` deja pasar el único clic que suelta la vuelta diferida; `spent`, ninguno más. */
type ReturnRelease = 'waiting' | 'releasing' | 'spent';
type PreviewReturn = {
  readonly href: string;
  readonly leaving: boolean;
  readonly attachLink: (element: HTMLAnchorElement | null) => void;
  readonly onReturn: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  readonly onAuxReturn: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

/**
 * Solo la entrega conoce la carpeta (la ruta identifica solo `fileId`): Volver pulsado antes de ella, con o sin
 * modificadores o con el clic central, espera a que la emisión termine y el mismo enlace navega una vez. Después, el
 * enlace vuelve a ser normal. El efecto no corre tras desmontar: una respuesta tardía no navega.
 */
function usePreviewReturn(fileId: string, emission: PreviewState): PreviewReturn {
  const link = React.useRef<HTMLAnchorElement>(null);
  const release = React.useRef<ReturnRelease>('waiting');
  const [leaving, setLeaving] = React.useState(false);
  const attachLink = React.useCallback((element: HTMLAnchorElement | null): void => {
    link.current = element;
  }, []);
  const settled = emission.status === 'success' || emission.status === 'failure';
  const file = emission.status === 'success' ? emission.delivery.file : undefined;
  const href = returnPathOf({ id: file?.id ?? fileId, folderId: file?.folderId ?? null });
  React.useEffect(() => {
    if (!leaving || !settled || release.current !== 'waiting') return;
    release.current = 'releasing';
    link.current?.click();
    release.current = 'spent';
  }, [leaving, settled]);
  const onReturn = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    if (release.current === 'releasing' || (settled && !leaving)) return;
    event.preventDefault();
    setLeaving(true);
  };
  const onAuxReturn = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    if (event.button === 1) onReturn(event);
  };
  return { href, leaving, attachLink, onReturn, onAuxReturn };
}

type PreviewHeaderProps = {
  readonly file: FileSummary | undefined;
  readonly back: PreviewReturn;
  readonly onDownload: () => void;
  readonly pending: boolean;
  readonly showDownload: boolean;
  readonly embedded: boolean;
};

/** `buttonVariants` atenúa solo `:disabled`, que un enlace no tiene: la espera se ve por `aria-disabled`. */
const WAITING_LINK =
  'aria-disabled:cursor-wait aria-disabled:opacity-45 aria-disabled:hover:bg-transparent';

function BackLink(props: PreviewReturn): React.JSX.Element {
  const { href, leaving, attachLink, onReturn, onAuxReturn } = props;
  return (
    <Link
      ref={attachLink}
      href={href}
      prefetch={false}
      onClick={onReturn}
      onAuxClick={onAuxReturn}
      aria-busy={leaving || undefined}
      aria-disabled={leaving || undefined}
      className={buttonVariants({ variant: 'ghost', className: WAITING_LINK })}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Volver
    </Link>
  );
}

function PreviewHeader(props: PreviewHeaderProps): React.JSX.Element {
  const { file, back, onDownload, pending } = props;
  return (
    <header className="space-y-4">
      {props.embedded ? null : <BackLink {...back} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          {props.embedded ? null : (
            <h1 className="break-words text-2xl font-semibold text-foreground">
              {file?.name ?? 'Vista previa'}
            </h1>
          )}
          {file === undefined ? null : <PreviewMetadata file={file} />}
        </div>
        {file === undefined || !props.showDownload ? null : (
          <Button type="button" variant="outline" onClick={onDownload} disabled={pending}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Descargar
          </Button>
        )}
      </div>
    </header>
  );
}

function DownloadFailure({ onRetry }: { readonly onRetry: () => void }): React.JSX.Element {
  return (
    <Alert variant="error" className="space-y-3">
      <AlertCircle className="h-5 w-5" aria-hidden="true" />
      <h2 className="font-semibold">No pudimos preparar la descarga.</h2>
      <p className="text-foreground">{messageForCode('INTERNAL_ERROR')}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </Alert>
  );
}

function usePreviewRequest(apiPublicUrl: string): PreviewUrlRequester {
  const authFetch = useAuthFetch();
  return React.useCallback(
    (id: string, signal: AbortSignal) =>
      requestPreviewUrl(apiPublicUrl, authFetch, { fileId: id, signal }),
    [apiPublicUrl, authFetch],
  );
}

/** La región de la vista previa recibe el foco al abrir y antes de cada acción que la reemplaza. */
function useFocusRegion() {
  const region = React.useRef<HTMLElement>(null);
  const attachRegion = React.useCallback((element: HTMLElement | null): void => {
    region.current = element;
  }, []);
  const focusRegion = (): void => region.current?.focus();
  React.useEffect(() => {
    region.current?.focus();
  }, []);
  return { focusRegion, attachRegion };
}

type ActionDeps = {
  readonly focusRegion: () => void;
  readonly download: ReturnType<typeof usePreviewDownload>;
  readonly content: ReturnType<typeof usePreviewContent>;
  readonly retry: () => void;
};

function previewActions({ focusRegion, download, content, retry }: ActionDeps) {
  return {
    onRetry: (): void => {
      focusRegion();
      download.reset();
      void content.retire().then((mounted) => {
        if (mounted) retry();
      });
    },
    onDownload: (): void => {
      focusRegion();
      download.start();
    },
  };
}

function usePreviewShell({
  fileId,
  apiPublicUrl,
  openDownloadUrl = openInBrowser,
}: PreviewPageProps) {
  const request = usePreviewRequest(apiPublicUrl);
  const { state: emission, retry, generation } = usePreview(fileId, request);
  const content = usePreviewContent(emission, generation);
  const state = content.state;
  const download = usePreviewDownload(fileId, openDownloadUrl);
  const { focusRegion, attachRegion } = useFocusRegion();
  const delivery = emission.status === 'success' ? emission.delivery : undefined;
  const back = usePreviewReturn(fileId, emission);
  const actions = previewActions({ focusRegion, download, content, retry });
  return {
    state,
    delivery,
    generation,
    content,
    download,
    attachRegion,
    file: delivery?.file,
    back,
    actions,
  };
}

type PreviewView = ReturnType<typeof usePreviewShell>;

function ReaderSlot({ view }: { readonly view: PreviewView }): React.JSX.Element | null {
  if (view.delivery === undefined) return null;
  return (
    <div hidden={view.state.status === 'failure'}>
      <PreviewReader
        key={view.generation}
        kind={view.delivery.file.kind}
        url={view.delivery.url}
        onFailure={view.content.onFailure}
        onReady={view.content.onReady}
        registerCleanup={view.content.registerCleanup}
      />
    </div>
  );
}

function PreviewBody({
  view,
  embedded,
}: {
  readonly view: PreviewView;
  readonly embedded: boolean;
}): React.JSX.Element {
  const { attachRegion, state, download, back, actions } = view;
  return (
    <section
      ref={attachRegion}
      aria-label="Vista previa"
      tabIndex={-1}
      aria-busy={state.status === 'idle' || state.status === 'loading' || undefined}
      className={cn(
        'min-h-64 rounded-lg border border-border bg-card p-4 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6',
        // En el diálogo el documento se desplaza dentro de su recuadro: la barra vertical queda junto a la horizontal.
        embedded && 'min-h-0 flex-1 overflow-auto',
      )}
    >
      <PreviewStates
        state={state}
        returnHref={back.href}
        onRetry={actions.onRetry}
        onDownload={actions.onDownload}
        downloadPending={download.pending}
      />
      <ReaderSlot view={view} />
      {download.failed ? <DownloadFailure onRetry={actions.onDownload} /> : null}
    </section>
  );
}

function PreviewShell(props: PreviewPageProps): React.JSX.Element {
  const view = usePreviewShell(props);
  return (
    <div
      className={
        props.embedded
          ? 'flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4'
          : 'mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6'
      }
    >
      <PreviewHeader
        embedded={props.embedded === true}
        file={view.file}
        back={view.back}
        onDownload={view.actions.onDownload}
        pending={view.download.pending}
        showDownload={view.state.status !== 'failure'}
      />
      <PreviewBody view={view} embedded={props.embedded === true} />
    </div>
  );
}

/** Cambiar de archivo destruye también el ciclo de descarga y todo el shell anterior. */
export function PreviewPage(props: PreviewPageProps): React.JSX.Element {
  return <PreviewShell key={props.fileId} {...props} />;
}
