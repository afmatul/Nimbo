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
import { useAuthFetch } from '../../../identity/session/use-auth-fetch';
import { requestPreviewUrl, type PreviewUrlRequester } from '../api';
import { usePreview } from '../hooks/use-preview';

import { PreviewStates } from './PreviewStates';

export type PreviewPageProps = {
  readonly fileId: string;
  readonly apiPublicUrl: string;
  readonly openDownloadUrl?: (url: string) => void;
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

type PreviewHeaderProps = {
  readonly file: FileSummary | undefined;
  readonly returnHref: string;
  readonly onDownload: () => void;
  readonly pending: boolean;
};

function PreviewHeader(props: PreviewHeaderProps): React.JSX.Element {
  const { file, returnHref, onDownload, pending } = props;
  return (
    <header className="space-y-4">
      <Link href={returnHref} prefetch={false} className={buttonVariants({ variant: 'ghost' })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="break-words text-2xl font-semibold text-foreground">
            {file?.name ?? 'Vista previa'}
          </h1>
          {file === undefined ? null : <PreviewMetadata file={file} />}
        </div>
        {file === undefined ? null : (
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

function usePreviewShell({
  fileId,
  apiPublicUrl,
  openDownloadUrl = openInBrowser,
}: PreviewPageProps) {
  const request = usePreviewRequest(apiPublicUrl);
  const { state, retry } = usePreview(fileId, request);
  const download = usePreviewDownload(fileId, openDownloadUrl);
  const region = React.useRef<HTMLElement>(null);
  const attachRegion = React.useCallback((element: HTMLElement | null): void => {
    region.current = element;
  }, []);
  React.useEffect(() => {
    region.current?.focus();
  }, []);
  const file = state.status === 'success' ? state.delivery.file : undefined;
  const returnHref = returnPathOf({ id: file?.id ?? fileId, folderId: file?.folderId ?? null });
  const onRetry = (): void => {
    region.current?.focus();
    download.reset();
    retry();
  };
  const onDownload = (): void => {
    region.current?.focus();
    download.start();
  };
  return { state, download, attachRegion, file, returnHref, actions: { onRetry, onDownload } };
}

type PreviewView = ReturnType<typeof usePreviewShell>;

function PreviewBody({ view }: { readonly view: PreviewView }): React.JSX.Element {
  const { attachRegion, state, download, returnHref, actions } = view;
  return (
    <section
      ref={attachRegion}
      aria-label="Vista previa"
      tabIndex={-1}
      aria-busy={state.status === 'idle' || state.status === 'loading' || undefined}
      className="min-h-64 rounded-lg border border-border bg-card p-4 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6"
    >
      <PreviewStates
        state={state}
        returnHref={returnHref}
        onRetry={actions.onRetry}
        onDownload={actions.onDownload}
        downloadPending={download.pending}
      />
      {download.failed ? <DownloadFailure onRetry={actions.onDownload} /> : null}
    </section>
  );
}

function PreviewShell(props: PreviewPageProps): React.JSX.Element {
  const view = usePreviewShell(props);
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PreviewHeader
        file={view.file}
        returnHref={view.returnHref}
        onDownload={view.actions.onDownload}
        pending={view.download.pending}
      />
      <PreviewBody view={view} />
    </div>
  );
}

/** Cambiar de archivo destruye también el ciclo de descarga y todo el shell anterior. */
export function PreviewPage(props: PreviewPageProps): React.JSX.Element {
  return <PreviewShell key={props.fileId} {...props} />;
}
