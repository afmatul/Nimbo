'use client';

import {
  formatBytes,
  SHARED_ERROR_CODES,
  SHARING_ERROR_CODES,
  type PublicLinkDetails,
} from '@nimbo/contracts';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Link2Off,
  Loader2,
  Lock,
  RotateCw,
  Share2,
} from 'lucide-react';
import { useId, useMemo, type JSX, type ReactNode } from 'react';

import { FileTypeIcon } from '../../../components/nimbo/file-type-chip';
import { IdentityCard } from '../../../components/nimbo/identity-card';
import { StateView } from '../../../components/nimbo/state-view';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { expiresAtLabel } from '../../../lib/format-date';
import { openInBrowser } from '../../../lib/use-preparing-download';
import { cn } from '../../../lib/utils';
import {
  usePublicLinkVisit,
  type PublicLinkDownloadOutcome,
  type PublicLinkVisit as Visit,
} from '../hooks/use-public-link-visit';
import {
  PUBLIC_LINK_DOWNLOAD_FAILED,
  PUBLIC_LINK_OPEN_FAILED,
  publicLinkMessage,
  type PublicLinkMessageKey,
} from '../public-link-messages';
import { createPublicLinkVisitorApi, type PublicLinkVisitorApi } from '../public-link-visitor-api';
import { receivedFileType } from '../received-file-type';

import { PublicLinkPasswordForm } from './public-link-password-form';

const PAGE_TITLE = 'Archivo compartido';
const DOWNLOAD_STARTED = 'Tu descarga comenzó. Si no empieza, vuelve a intentarlo.';
const PREPARING_LABEL = 'Preparando descarga…';
/** PD-189: sobre advertencia y error el borde `input` del `outline` no llega a 3:1; `secondary-foreground` sí. */
const RETRY_ON_TINT = 'border-secondary-foreground text-foreground';

/** «Qué pasó. Qué hacer.» del catálogo → título y texto de `StateView` (mockup: `h2` y párrafo). */
function splitMessage(key: PublicLinkMessageKey, retryAfterSeconds?: number) {
  const [title = '', ...rest] = publicLinkMessage(key, retryAfterSeconds).title.split(/(?<=\.) /);
  return { title, description: rest.join(' ') };
}

/** Sin ficha (no disponible, error y `429` al abrir): la página conserva un `h1` y el estado va en `h2`. */
function WithoutDetails({ children }: { readonly children: ReactNode }): JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 id={headingId} className="sr-only">
        {PAGE_TITLE}
      </h1>
      {children}
    </section>
  );
}

function Skeleton({ className }: { readonly className: string }): JSX.Element {
  return <span className={cn('block animate-pulse rounded-full bg-muted', className)} />;
}

/** Esqueleto con la forma de la ficha y un anuncio (CA-1). */
function LoadingDetails(): JSX.Element {
  return (
    <WithoutDetails>
      <Card className="space-y-6 p-6 sm:p-8">
        <div aria-hidden="true" className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <Skeleton className="h-5 w-4/5" />
          </div>
          <div className="flex items-center gap-3 rounded-md border border-border p-3 sm:p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-11 rounded-md" />
        </div>
        <p
          role="status"
          className="flex items-center justify-center gap-2 text-sm text-secondary-foreground"
        >
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Cargando el archivo compartido…
        </p>
      </Card>
    </WithoutDetails>
  );
}

/** Un solo mensaje para todo motivo, sin acción (CA-6, RN-1). */
function UnavailableState(): JSX.Element {
  const { title, description } = splitMessage(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE);
  return (
    <WithoutDetails>
      <StateView
        type="empty"
        role="status"
        headingLevel="h2"
        icon={Link2Off}
        title={title}
        description={description}
      />
    </WithoutDetails>
  );
}

/** Red o 5xx al abrir, distinto de «no disponible» (CA-7). */
function LoadErrorState({ reload }: { readonly reload: () => void }): JSX.Element {
  const { title, description } = splitMessage(PUBLIC_LINK_OPEN_FAILED);
  return (
    <WithoutDetails>
      <StateView
        type="error"
        headingLevel="h2"
        title={title}
        description={description}
        action={{ label: 'Reintentar', onClick: reload, variant: 'outline' }}
        className="[&_button]:border-secondary-foreground"
      />
    </WithoutDetails>
  );
}

interface RateLimitedProps {
  readonly retryAfterSeconds: number | undefined;
  readonly reload: () => void;
}

/** `429` al abrir: el diseño de error-carga en tono de advertencia, sin ficha (CA-5). */
function RateLimitedState({ retryAfterSeconds, reload }: RateLimitedProps): JSX.Element {
  const { title, description } = splitMessage(
    SHARED_ERROR_CODES.TOO_MANY_REQUESTS,
    retryAfterSeconds,
  );
  return (
    <WithoutDetails>
      <StateView
        type="empty"
        role="status"
        headingLevel="h2"
        icon={Clock}
        title={title}
        description={description}
        action={{ label: 'Reintentar', onClick: reload, variant: 'outline' }}
        className="border-warning bg-warning/10 [&_button]:border-secondary-foreground [&_h2]:text-warning-foreground [&_p]:text-foreground [&_svg]:text-warning-foreground"
      />
    </WithoutDetails>
  );
}

/** Ícono del tipo, nombre, tamaño y vencimiento absoluto (CA-1, S-4); en 360 px el vencimiento baja de línea. */
function FileSummary({ details }: { readonly details: PublicLinkDetails }): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 sm:p-4">
      <FileTypeIcon
        fileType={receivedFileType(details.name)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-secondary-foreground sm:h-10 sm:w-10"
      />
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

function NoticeAlert({
  variant,
  icon,
  children,
}: {
  readonly variant: 'warning' | 'success';
  readonly icon: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Alert variant={variant} className="flex items-start gap-2.5 text-left">
      {icon}
      <div className="grid min-w-0 justify-items-start gap-2.5">{children}</div>
    </Alert>
  );
}

const iconClass = 'mt-0.5 h-4 w-4 shrink-0';

function DownloadStartedNotice(): JSX.Element {
  return (
    <NoticeAlert
      variant="success"
      icon={<CheckCircle2 aria-hidden="true" className={`${iconClass} text-success-foreground`} />}
    >
      <p>{DOWNLOAD_STARTED}</p>
    </NoticeAlert>
  );
}

function RateLimitedNotice({
  retryAfterSeconds,
}: {
  readonly retryAfterSeconds: number | undefined;
}): JSX.Element {
  const { title } = publicLinkMessage(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, retryAfterSeconds);
  return (
    <NoticeAlert variant="warning" icon={<Clock aria-hidden="true" className={iconClass} />}>
      <p>{title}</p>
    </NoticeAlert>
  );
}

/** La red falla al descargar: el diseño de «bloqueado» con «Reintentar» (CA-7). */
function DownloadFailedNotice({ retry }: { readonly retry: () => void }): JSX.Element {
  return (
    <NoticeAlert variant="warning" icon={<AlertCircle aria-hidden="true" className={iconClass} />}>
      <p>{publicLinkMessage(PUBLIC_LINK_DOWNLOAD_FAILED).title}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${RETRY_ON_TINT} min-h-11 sm:min-h-9`}
        onClick={retry}
      >
        <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
        Reintentar
      </Button>
    </NoticeAlert>
  );
}

/** Avisos entre la ficha y la acción, con `role="status"`; la ficha sigue a la vista (CA-3, CA-5, CA-7). */
function DownloadNotice({ outcome }: { readonly outcome: PublicLinkDownloadOutcome }): ReactNode {
  switch (outcome.status) {
    case 'started':
      return <DownloadStartedNotice />;
    case 'rate-limited':
      return <RateLimitedNotice retryAfterSeconds={outcome.retryAfterSeconds} />;
    case 'download-error':
      return <DownloadFailedNotice retry={outcome.retry} />;
    default:
      return null;
  }
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
  visit,
  details,
}: {
  readonly visit: Visit;
  readonly details: PublicLinkDetails;
}) {
  const download = (password?: string): void => void visit.download(password);
  if (!details.requiresPassword) {
    return <DownloadButton type="button" preparing={visit.preparing} onClick={() => download()} />;
  }
  return (
    <PublicLinkPasswordForm
      outcome={visit.outcome}
      preparing={visit.preparing}
      onDownload={download}
      submit={<DownloadButton type="submit" preparing={visit.preparing} />}
    />
  );
}

/** La ficha: la ve cualquiera con el enlace, sin escribir nada (RN-2). El candado indica que pide contraseña. */
function SharedFileCard({
  visit,
  details,
}: {
  readonly visit: Visit;
  readonly details: PublicLinkDetails;
}) {
  const titleId = useId();
  return (
    <IdentityCard
      titleId={titleId}
      title={`${details.sharedBy.displayName} compartió un archivo contigo`}
      icon={details.requiresPassword ? Lock : Share2}
      tone="info"
    >
      <FileSummary details={details} />
      <DownloadNotice outcome={visit.outcome} />
      <DownloadAction visit={visit} details={details} />
    </IdentityCard>
  );
}

export interface PublicLinkVisitViewProps {
  readonly api: PublicLinkVisitorApi;
  readonly openUrl: (url: string) => void;
}

/** Los estados de la página `/enlace#<token>` (013b §6), con el cliente y la apertura inyectados. */
export function PublicLinkVisitView({ api, openUrl }: PublicLinkVisitViewProps): JSX.Element {
  const visit = usePublicLinkVisit(api, openUrl);
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
      return <SharedFileCard visit={visit} details={state.details} />;
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
