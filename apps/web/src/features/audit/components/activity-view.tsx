'use client';

import { CalendarX, History, Loader2 } from 'lucide-react';
import * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { StateView } from '../../../components/nimbo/state-view';
import { SignOutButton } from '../../identity/components/sign-out-button';
import { createAuthFetch } from '../../identity/session/auth-fetch';
import { useSession } from '../../identity/session/session-provider';
import { SidebarQuota } from '../../storage/components/sidebar-quota';
import { useSpace } from '../../storage/components/space-provider';
import { createAuditApi } from '../audit-api';
import {
  useActivity,
  type Activity,
  type ActivityListing,
  type LoadActivity,
} from '../hooks/use-activity';

import { ActivityEventRow } from './activity-event-row';
import { ActivityFilters } from './activity-filters';
import { LoadMoreFooter } from './load-more-footer';

/** «Mi actividad» no está en la navegación lateral: ningún ítem queda activo. */
const ACTIVITY_NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({ ...item, active: false }));
/** Anchos de la línea principal; distintos entre sí: sirven de `key`. */
const SKELETON_ROWS = ['w-3/5', 'w-1/2', 'w-2/3', 'w-2/5', 'w-4/5'];
const LIST_TITLE = 'Eventos, del más reciente al más antiguo';

function resultTextOf({ listing }: Activity): string {
  if (listing.status === 'filteredEmpty') return '0 eventos';
  if (listing.status !== 'data') return '';
  const count = listing.items.length;
  const events = count === 1 ? '1 evento' : `${String(count)} eventos`;
  return `Mostrando ${events}, del más reciente al más antiguo`;
}

function errorDescription(correlationId: string): string {
  const lead = 'Intenta de nuevo.';
  return correlationId === ''
    ? lead
    : `${lead} Si el problema sigue, comparte este código con soporte: ${correlationId}`;
}

const PULSE = 'animate-pulse rounded-md bg-muted motion-reduce:animate-none';

function SkeletonRow({ width }: { readonly width: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
      <span className={`h-9 w-9 shrink-0 ${PULSE}`} />
      <span className="flex flex-1 flex-col gap-2">
        <span className={`block h-3 ${width} ${PULSE}`} />
        <span className={`block h-3 w-1/3 ${PULSE}`} />
      </span>
    </div>
  );
}

/** Esqueleto con la forma de las filas (oculto a lectores) y el estado anunciado (mockup `cargando`). */
function ActivitySkeleton(): React.JSX.Element {
  return (
    <section
      aria-busy="true"
      aria-label={LIST_TITLE}
      className="rounded-lg border border-border bg-card"
    >
      <div aria-hidden="true">
        {SKELETON_ROWS.map((width) => (
          <SkeletonRow key={width} width={width} />
        ))}
      </div>
      <p
        role="status"
        className="flex items-center justify-center gap-2 py-3 text-sm text-secondary-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Cargando tu actividad…
      </p>
    </section>
  );
}

type ActivityData = Extract<ActivityListing, { status: 'data' }>;

/** Lista con su pie; mientras pide la página siguiente queda `aria-busy` y conserva lo visible (CA-9). */
function EventList({
  activity,
  listing,
}: {
  readonly activity: Activity;
  readonly listing: ActivityData;
}): React.JSX.Element {
  return (
    <section
      aria-labelledby="lista-titulo"
      aria-busy={activity.more === 'loading' || undefined}
      className="flex flex-col gap-4"
    >
      <h2 id="lista-titulo" className="sr-only">
        {LIST_TITLE}
      </h2>
      <ol
        aria-labelledby="lista-titulo"
        className="overflow-hidden rounded-lg border border-border bg-card shadow-card"
      >
        {listing.items.map((event) => (
          <ActivityEventRow key={event.id} event={event} />
        ))}
      </ol>
      <LoadMoreFooter
        status={activity.more}
        hasMore={activity.hasMore}
        onLoadMore={activity.loadMore}
      />
    </section>
  );
}

function ActivityError({
  correlationId,
  onRetry,
}: {
  readonly correlationId: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <StateView
      type="error"
      headingLevel="h2"
      title="No pudimos cargar tu actividad"
      description={errorDescription(correlationId)}
      action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
    />
  );
}

/** Vacío de la cuenta (CA-11) o vacío con filtros, que ofrece el único «Limpiar filtros» (CA-10). */
function ActivityEmpty({ onClear }: { readonly onClear: (() => void) | null }): React.JSX.Element {
  if (onClear === null) {
    return (
      <StateView
        type="empty"
        headingLevel="h2"
        icon={History}
        title="Aún no hay actividad en tu cuenta"
        description="Cuando subas, descargues o elimines archivos, o el personal de Nimbo haga algo en tu cuenta, lo verás aquí."
      />
    );
  }
  return (
    <StateView
      type="empty"
      headingLevel="h2"
      icon={CalendarX}
      title="No hay actividad con estos filtros"
      description="Prueba con otro rango de fechas u otro origen."
      action={{ label: 'Limpiar filtros', onClick: onClear, variant: 'outline' }}
    />
  );
}

/** Lista o el estado que toca: cargando, error con `correlationId`, vacío, vacío con filtros (CA-11, CA-15). */
function ActivityBody({ activity }: { readonly activity: Activity }): React.JSX.Element {
  const { listing } = activity;
  if (listing.status === 'loading') return <ActivitySkeleton />;
  if (listing.status === 'error') {
    return <ActivityError correlationId={listing.correlationId} onRetry={activity.retry} />;
  }
  if (listing.status === 'empty') return <ActivityEmpty onClear={null} />;
  if (listing.status === 'filteredEmpty') return <ActivityEmpty onClear={activity.clearFilters} />;
  return <EventList activity={activity} listing={listing} />;
}

/** Sin actividad no hay nada que filtrar; con el vacío de filtros, «Limpiar filtros» va solo en el estado (un botón). */
function ActivityContent({ activity }: { readonly activity: Activity }): React.JSX.Element {
  const { listing } = activity;
  return (
    <div className="flex flex-col gap-4">
      {listing.status === 'empty' ? null : (
        <ActivityFilters
          filters={activity.filters}
          invalidRange={activity.invalidRange}
          clearable={activity.hasFilters && listing.status !== 'filteredEmpty'}
          resultText={resultTextOf(activity)}
          onChange={activity.changeFilters}
          onClear={activity.clearFilters}
        />
      )}
      <ActivityBody activity={activity} />
    </div>
  );
}

/**
 * «Mi actividad» (spec 004 D-4, mockup `audit/mi-actividad`): lo que se hizo en la cuenta, por el cliente y por el
 * personal de Nimbo, con filtros, «Cargar más» y sus estados (CA-7, CA-9 a CA-11, CA-13, CA-15). Sin migas.
 */
export function ActivityView({ load }: { readonly load: LoadActivity }): React.JSX.Element {
  const activity = useActivity(load);
  const space = useSpace();
  return (
    <AppLayout navItems={ACTIVITY_NAV_ITEMS} quotaCard={<SidebarQuota state={space.state} />}>
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div className="flex justify-end">
          <SignOutButton />
        </div>
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Mi actividad</h1>
          <p className="mt-1 text-sm text-secondary-foreground">
            Lo que se hizo en tu cuenta, por ti y por el personal de Nimbo. Solo ves el tipo y la
            cantidad de elementos, nunca sus nombres, y nadie puede modificar ni borrar este
            registro.
          </p>
        </header>
        <ActivityContent activity={activity} />
      </div>
    </AppLayout>
  );
}

/** `GET /audit/my-events` con el token de la sesión, leído en cada petición: renovarlo no vuelve a pedir la lista. */
interface TokenHolder {
  readonly get: () => string | null;
  readonly set: (token: string | null) => void;
}

/** Último token de acceso, leído al hacer cada petición (mismo patrón que `SessionUploadsProvider` de `storage`). */
function createTokenHolder(initial: string | null): TokenHolder {
  let current = initial;
  return {
    get: () => current,
    set: (token) => {
      current = token;
    },
  };
}

function useSessionAuditLoad(apiPublicUrl: string): LoadActivity {
  const { accessToken, renew } = useSession();
  const [token] = React.useState(() => createTokenHolder(accessToken));
  React.useEffect(() => token.set(accessToken), [token, accessToken]);
  return React.useMemo(() => {
    const api = createAuditApi(apiPublicUrl, createAuthFetch({ getAccessToken: token.get, renew }));
    return (query) => api.listMyEvents(query);
  }, [apiPublicUrl, token, renew]);
}

/** La vista conectada a la API con la sesión en memoria (002). */
export function SessionActivityView({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <ActivityView load={useSessionAuditLoad(apiPublicUrl)} />;
}
