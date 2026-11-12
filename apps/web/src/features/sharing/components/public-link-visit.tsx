'use client';

import { formatBytes, type PublicLinkDetails } from '@nimbo/contracts';
import { Download, Loader2, Lock, Share2 } from 'lucide-react';
import { useId, useMemo, type JSX } from 'react';

import { FileTypeIcon, fileTypeColors } from '../../../components/nimbo/file-type-chip';
import { IdentityCard } from '../../../components/nimbo/identity-card';
import { Button } from '../../../components/ui/button';
import { expiresAtLabel } from '../../../lib/format-date';
import { openInBrowser } from '../../../lib/use-preparing-download';
import {
  usePublicLinkDownload,
  type PublicLinkDownload,
  type PublicLinkDownloadInput,
} from '../hooks/use-public-link-download';
import { usePublicLinkVisit } from '../hooks/use-public-link-visit';
import { createPublicLinkVisitorApi, type PublicLinkVisitorApi } from '../public-link-visitor-api';
import { receivedFileType } from '../received-file-type';

import { DownloadNotice } from './public-link-notices';
import { PublicLinkPasswordForm } from './public-link-password-form';
import {
  LoadErrorState,
  LoadingDetails,
  RateLimitedState,
  UnavailableState,
} from './public-link-states';

const PREPARING_LABEL = 'Preparando descarga…';

/** Ícono del tipo, nombre, tamaño y vencimiento absoluto (CA-1, S-4); en 360 px el vencimiento baja de línea. */
function FileSummary({ details }: { readonly details: PublicLinkDetails }): JSX.Element {
  const fileType = receivedFileType(details.name);
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 sm:p-4">
      <span
        style={fileTypeColors(fileType)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10"
      >
        <FileTypeIcon fileType={fileType} />
      </span>
      <div className="min-w-0 text-left">
        <p className="wrap-anywhere text-sm font-semibold text-foreground sm:text-base">
          {details.name}
        </p>
        <p className="mt-0.5 flex flex-col text-sm tabular-nums text-muted-foreground sm:flex-row sm:gap-1.5">
          <span>{formatBytes(details.sizeBytes)}</span>
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span>{`Vence el ${expiresAtLabel(details.expiresAt)}`}</span>
        </p>
      </div>
    </div>
  );
}

interface DownloadButtonProps {
  readonly preparing: boolean;
  readonly type: 'button' | 'submit';
  readonly onClick?: () => void;
}

/** «Descargar»; pasados 2 s, «Preparando descarga…» con su color y `aria-disabled`, y un anuncio (CA-3). */
function DownloadButton({ preparing, type, onClick }: DownloadButtonProps): JSX.Element {
  const Icon = preparing ? Loader2 : Download;
  return (
    <>
      <Button
        type={type}
        className="w-full aria-disabled:cursor-progress"
        aria-disabled={preparing || undefined}
        onClick={preparing ? undefined : onClick}
      >
        <Icon aria-hidden="true" className={preparing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {preparing ? PREPARING_LABEL : 'Descargar'}
      </Button>
      {preparing ? (
        <p role="status" className="sr-only">
          {PREPARING_LABEL}
        </p>
      ) : null}
    </>
  );
}

/** Con contraseña, el formulario antes de «Descargar» (CA-2); sin ella, solo el botón (CA-1). */
function DownloadAction({
  prepared,
  details,
}: {
  readonly prepared: PublicLinkDownload;
  readonly details: PublicLinkDetails;
}) {
  const download = (password?: string): void => void prepared.download(password);
  if (!details.requiresPassword) {
    return (
      <DownloadButton type="button" preparing={prepared.preparing} onClick={() => download()} />
    );
  }
  return (
    <PublicLinkPasswordForm
      outcome={prepared.outcome}
      preparing={prepared.preparing}
      onDownload={download}
      submit={<DownloadButton type="submit" preparing={prepared.preparing} />}
    />
  );
}

interface SharedFileCardProps extends PublicLinkDownloadInput {
  readonly details: PublicLinkDetails;
}

/**
 * La ficha: la ve cualquiera con el enlace, sin escribir nada (RN-2). El candado indica que pide contraseña. Se monta
 * con `key` = número de pedido: cada pedido tiene su propia descarga (013c CA-18).
 */
function SharedFileCard({ details, ...input }: SharedFileCardProps) {
  const prepared = usePublicLinkDownload(input);
  const titleId = useId();
  return (
    <IdentityCard
      titleId={titleId}
      title={`${details.sharedBy.displayName} compartió un archivo contigo`}
      icon={details.requiresPassword ? Lock : Share2}
      tone="info"
    >
      <FileSummary details={details} />
      <DownloadNotice outcome={prepared.outcome} />
      <DownloadAction prepared={prepared} details={details} />
    </IdentityCard>
  );
}

export interface PublicLinkVisitViewProps {
  /** Debe ser estable entre renders (`useMemo`): uno nuevo vuelve a pedir la ficha con `POST /open`. */
  readonly api: PublicLinkVisitorApi;
  readonly openUrl: (url: string) => void;
}

/** Los estados de la página `/enlace#<token>` (013b §6), con el cliente y la apertura inyectados. */
export function PublicLinkVisitView({ api, openUrl }: PublicLinkVisitViewProps): JSX.Element {
  const visit = usePublicLinkVisit(api);
  const { state } = visit;
  switch (state.status) {
    case 'loading':
      return <LoadingDetails />;
    case 'unavailable':
      return <UnavailableState />;
    case 'load-error':
      return <LoadErrorState reload={visit.reload} />;
    case 'rate-limited':
      return <RateLimitedState retryAfterSeconds={state.retryAfterSeconds} reload={visit.reload} />;
    case 'ready':
      return (
        <SharedFileCard
          key={visit.request?.number}
          api={api}
          openUrl={openUrl}
          visit={visit}
          details={state.details}
        />
      );
  }
}

/**
 * Página del visitante del enlace público (013b CA-1 a CA-10): el navegador va directo a `API_PUBLIC_URL`, sin
 * sesión, y la descarga se abre en la misma pestaña.
 */
export function PublicLinkVisit({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const api = useMemo(() => createPublicLinkVisitorApi(apiPublicUrl), [apiPublicUrl]);
  return <PublicLinkVisitView api={api} openUrl={openInBrowser} />;
}
