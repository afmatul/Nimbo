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

import { FileTypeIcon, fileTypeColors } from '../../../components/nimbo/file-type-chip';
import { IdentityCard } from '../../../components/nimbo/identity-card';
import { StateView, type StateViewProps } from '../../../components/nimbo/state-view';
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
  type PublicLinkMessageTone,
} from '../public-link-messages';
import { createPublicLinkVisitorApi, type PublicLinkVisitorApi } from '../public-link-visitor-api';
import { receivedFileType } from '../received-file-type';

import { PublicLinkPasswordForm } from './public-link-password-form';

const PAGE_TITLE = 'Archivo compartido';
const DOWNLOAD_STARTED = 'Tu descarga comenzó. Si no empieza, vuelve a intentarlo.';
const PREPARING_LABEL = 'Preparando descarga…';
/**
 * PD-189: sobre advertencia y error el borde `input` del `outline` no llega a 3:1; `secondary-foreground` sí. Va en el
 * contenedor de «Reintentar» y el texto queda en `foreground` aunque el contenedor lo tiña.
 */
const RETRY_ON_TINT = '[&_button]:border-secondary-foreground [&_button]:text-foreground';

/** Tono del catálogo → `StateView` sin ficha; `warning` es el diseño de error-carga en tono de advertencia (CA-5). */
const STATE_VIEW_BY_TONE: Readonly<
  Record<PublicLinkMessageTone, { readonly type: 'empty' | 'error'; readonly className?: string }>
> = {
  neutral: { type: 'empty' },
  error: { type: 'error' },
  warning: {
    type: 'empty',
    className:
      'border-warning bg-warning/10 [&_h2]:text-warning-foreground [&_p]:text-foreground [&_svg]:text-warning-foreground',
  },
};

/** Tono del catálogo → `variant` del `Alert` de los avisos sobre la ficha. */
const ALERT_VARIANT_BY_TONE: Readonly<Record<PublicLinkMessageTone, 'info' | 'error' | 'warning'>> =
  {
    neutral: 'info',
    error: 'error',
    warning: 'warning',
  };

/** «Qué pasó. Qué hacer.» del catálogo → título y texto de `StateView` (mockup: `h2` y párrafo). */
function splitTitle(message: string) {
  const [title = '', ...rest] = message.split(/(?<=\.) /);
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

interface CatalogStateProps {
  readonly messageKey: PublicLinkMessageKey;
  readonly retryAfterSeconds?: number | undefined;
  readonly icon?: StateViewProps['icon'];
  readonly reload?: () => void;
}

/**
 * Un estado sin ficha con el texto y el tono del catálogo; con `reload`, «Reintentar» (CA-5 a CA-7). El tono `error`
 * de `StateView` exige una acción (RNF-14): sin `reload` se muestra como estado, anunciado con `role="status"`.
 */
function CatalogState({ messageKey, retryAfterSeconds, icon, reload }: CatalogStateProps) {
  const message = publicLinkMessage(messageKey, retryAfterSeconds);
  const { type, className } = STATE_VIEW_BY_TONE[message.tone];
  const shared = {
    ...splitTitle(message.title),
    headingLevel: 'h2' as const,
    ...(icon && { icon }),
    className: cn(className, reload && RETRY_ON_TINT),
  };
  const action = reload && { label: 'Reintentar', onClick: reload, variant: 'outline' as const };
  return (
    <WithoutDetails>
      {action === undefined ? (
        <StateView type="empty" role="status" {...shared} />
      ) : type === 'error' ? (
        <StateView type="error" action={action} {...shared} />
      ) : (
        <StateView type="empty" role="status" action={action} {...shared} />
      )}
    </WithoutDetails>
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
  return <CatalogState messageKey={SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE} icon={Link2Off} />;
}

/** Red o 5xx al abrir, distinto de «no disponible» (CA-7). */
function LoadErrorState({ reload }: { readonly reload: () => void }): JSX.Element {
  return <CatalogState messageKey={PUBLIC_LINK_OPEN_FAILED} reload={reload} />;
}

interface RateLimitedProps {
  readonly retryAfterSeconds: number | undefined;
  readonly reload: () => void;
}

/** `429` al abrir: el diseño de error-carga en tono de advertencia, sin ficha (CA-5). */
function RateLimitedState({ retryAfterSeconds, reload }: RateLimitedProps): JSX.Element {
  return (
    <CatalogState
      messageKey={SHARED_ERROR_CODES.TOO_MANY_REQUESTS}
      retryAfterSeconds={retryAfterSeconds}
      icon={Clock}
      reload={reload}
    />
  );
}

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

interface NoticeAlertProps {
  /** `success` no es un estado del catálogo: es el resultado de la descarga. */
  readonly variant: (typeof ALERT_VARIANT_BY_TONE)[PublicLinkMessageTone] | 'success';
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

function NoticeAlert({ variant, icon, children, className }: NoticeAlertProps): JSX.Element {
  return (
    <Alert variant={variant} className={cn('flex items-start gap-2.5 text-left', className)}>
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
  const { title, tone } = publicLinkMessage(
    SHARED_ERROR_CODES.TOO_MANY_REQUESTS,
    retryAfterSeconds,
  );
  return (
    <NoticeAlert
      variant={ALERT_VARIANT_BY_TONE[tone]}
      icon={<Clock aria-hidden="true" className={iconClass} />}
    >
      <p>{title}</p>
    </NoticeAlert>
  );
}

/** La red falla al descargar: el diseño de «bloqueado» con «Reintentar» (CA-7). */
function DownloadFailedNotice({ retry }: { readonly retry: () => void }): JSX.Element {
  const { title, tone } = publicLinkMessage(PUBLIC_LINK_DOWNLOAD_FAILED);
  return (
    <NoticeAlert
      variant={ALERT_VARIANT_BY_TONE[tone]}
      icon={<AlertCircle aria-hidden="true" className={iconClass} />}
      className={RETRY_ON_TINT}
    >
      <p>{title}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 sm:min-h-9"
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
