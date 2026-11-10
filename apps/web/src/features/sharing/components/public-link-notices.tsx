'use client';

import { SHARED_ERROR_CODES } from '@nimbo/contracts';
import { AlertCircle, CheckCircle2, Clock, RotateCw } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import type { PublicLinkDownloadOutcome } from '../hooks/use-public-link-visit';
import {
  PUBLIC_LINK_DOWNLOAD_FAILED,
  publicLinkMessage,
  type PublicLinkMessageTone,
} from '../public-link-messages';

import { RETRY_ON_TINT } from './public-link-states';

const DOWNLOAD_STARTED = 'Tu descarga comenzó. Si no empieza, vuelve a intentarlo.';

/** Tono del catálogo → `variant` del `Alert` de los avisos sobre la ficha. */
const ALERT_VARIANT_BY_TONE: Readonly<Record<PublicLinkMessageTone, 'info' | 'error' | 'warning'>> =
  {
    neutral: 'info',
    error: 'error',
    warning: 'warning',
  };

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
export function DownloadNotice({
  outcome,
}: {
  readonly outcome: PublicLinkDownloadOutcome;
}): ReactNode {
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
