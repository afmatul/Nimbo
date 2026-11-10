'use client';

import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { Clock, Link2Off, Loader2 } from 'lucide-react';
import { useId, type JSX, type ReactNode } from 'react';

import { StateView, type StateViewProps } from '../../../components/nimbo/state-view';
import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import {
  PUBLIC_LINK_OPEN_FAILED,
  publicLinkMessage,
  type PublicLinkMessageKey,
  type PublicLinkMessageTone,
} from '../public-link-messages';

const PAGE_TITLE = 'Archivo compartido';
/**
 * PD-189: sobre advertencia y error el borde `input` del `outline` no llega a 3:1; `secondary-foreground` sí. Va en el
 * contenedor de «Reintentar» y el texto queda en `foreground` aunque el contenedor lo tiña.
 */
export const RETRY_ON_TINT = '[&_button]:border-secondary-foreground [&_button]:text-foreground';

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
export function LoadingDetails(): JSX.Element {
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
export function UnavailableState(): JSX.Element {
  return <CatalogState messageKey={SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE} icon={Link2Off} />;
}

/** Red o 5xx al abrir, distinto de «no disponible» (CA-7). */
export function LoadErrorState({ reload }: { readonly reload: () => void }): JSX.Element {
  return <CatalogState messageKey={PUBLIC_LINK_OPEN_FAILED} reload={reload} />;
}

interface RateLimitedProps {
  readonly retryAfterSeconds: number | undefined;
  readonly reload: () => void;
}

/** `429` al abrir: el diseño de error-carga en tono de advertencia, sin ficha (CA-5). */
export function RateLimitedState({ retryAfterSeconds, reload }: RateLimitedProps): JSX.Element {
  return (
    <CatalogState
      messageKey={SHARED_ERROR_CODES.TOO_MANY_REQUESTS}
      retryAfterSeconds={retryAfterSeconds}
      icon={Clock}
      reload={reload}
    />
  );
}
