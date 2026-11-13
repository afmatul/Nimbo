'use client';

import type { SearchHit } from '@nimbo/contracts';
import { Loader2, Search as SearchIcon, SearchX } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { StateView } from '../../../components/nimbo/state-view';
import { cn } from '../../../lib/utils';
import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { LoadMore } from '../../storage/components/load-more';
import { SidebarQuota } from '../../storage/components/sidebar-quota';
import { useSpace } from '../../storage/components/space-provider';
import { useClientSidebar } from '../../storage/components/use-client-sidebar';
import { createStorageHttp } from '../../storage/storage-http';
import { SEARCH_PATH } from '../search-url';
import {
  fetchSearchPage,
  useSearch,
  type LoadSearch,
  type Search,
  type SearchLocation,
} from '../use-search';

import { SearchFilters } from './search-filters';
import { SearchForm } from './search-form';
import { resultsTitle, ScopeNote, SearchResults } from './search-results';

const SEARCH_NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({
  ...item,
  active: item.href === SEARCH_PATH,
}));
/** Anchos de la línea del nombre; distintos entre sí: sirven de `key`. */
const SKELETON_ROWS = ['w-3/5', 'w-2/5', 'w-2/3', 'w-1/2', 'w-1/3'];
const PULSE = 'animate-pulse rounded-md bg-muted motion-reduce:animate-none';

/** Esqueleto con la forma de la lista (oculto a lectores) y «Buscando «texto»…» anunciado (mockup `cargando`). */
function SearchSkeleton({ q }: { readonly q: string }): React.JSX.Element {
  return (
    <section aria-busy="true" aria-label={resultsTitle(q)} className="space-y-3">
      <div aria-hidden="true" className="rounded-lg border border-border bg-card">
        {SKELETON_ROWS.map((width) => (
          <div
            key={width}
            className="flex h-14 items-center gap-3 border-b border-border px-4 last:border-b-0"
          >
            <span className={`h-8 w-8 shrink-0 ${PULSE}`} />
            <span className={`block h-3 ${width} ${PULSE}`} />
          </div>
        ))}
      </div>
      <p role="status" className="flex items-center gap-2 text-sm text-secondary-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {`Buscando «${q}»…`}
      </p>
    </section>
  );
}

/**
 * Sin coincidencias (CA-11): con filtros activos sugiere quitarlos y ofrece la acción; sin ellos, no hay acción. La
 * nota de alcance explica que un documento sin indexar solo aparece por su nombre (018b CA-8, decisión 5).
 */
function NoResults({ search }: { readonly search: Search }): React.JSX.Element {
  const filtered = search.activeFilters > 0;
  return (
    <div className="space-y-3">
      <StateView
        type="empty"
        headingLevel="h2"
        icon={SearchX}
        title={`No encontramos nada con «${search.q}».`}
        description={
          filtered ? 'Revisa lo que escribiste o quita los filtros.' : 'Revisa lo que escribiste.'
        }
        {...(filtered
          ? {
              action: { label: 'Quitar filtros', onClick: search.clearFilters, variant: 'outline' },
            }
          : {})}
      />
      <ScopeNote />
    </div>
  );
}

/**
 * Lista con «Cargar más» (patrón de 007). Con un rango inválido la lista anterior se atenúa y queda inactiva: ya no
 * corresponde a los filtros (CA-9, observación 2 del mockup).
 */
function ResultsSection({
  search,
  hits,
}: {
  readonly search: Search;
  readonly hits: readonly SearchHit[];
}): React.JSX.Element {
  return (
    <section
      aria-labelledby="resultados-titulo"
      aria-busy={search.more === 'loading' || undefined}
      className="space-y-3"
    >
      <h2 id="resultados-titulo" className="text-base font-semibold text-foreground">
        {resultsTitle(search.q)}
      </h2>
      <ScopeNote />
      <div
        data-testid={search.stale ? 'resultados-desactualizados' : undefined}
        inert={search.stale || undefined}
        className={cn('space-y-4', search.stale && 'opacity-50')}
      >
        <SearchResults q={search.q} hits={hits} />
        {search.stale ? null : (
          <LoadMore
            status={search.more}
            hasMore={search.hasMore}
            added={search.added}
            placeName="la búsqueda"
            onLoadMore={search.loadMore}
            onDismissError={search.dismissMoreError}
          />
        )}
      </div>
    </section>
  );
}

/** El estado que toca bajo los filtros (CA-11): cargando, error con «Reintentar», sin resultados o la lista. */
function SearchBody({ search }: { readonly search: Search }): React.JSX.Element | null {
  const { listing } = search;
  if (listing.status === 'loading') return <SearchSkeleton q={search.q} />;
  if (listing.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h2"
        title="No pudimos buscar."
        description="Revisa tu conexión y vuelve a intentarlo."
        action={{ label: 'Reintentar', onClick: search.retry, variant: 'outline' }}
      />
    );
  }
  if (listing.status === 'empty') return <NoResults search={search} />;
  if (listing.status === 'data') return <ResultsSection search={search} hits={listing.items} />;
  return null;
}

/** Sin texto no se busca ni hay filtros (CA-6, mockup `entrada`). */
function SearchEntry(): React.JSX.Element {
  return (
    <StateView
      type="empty"
      headingLevel="h2"
      icon={SearchIcon}
      title="Escribe qué quieres buscar."
      description="Lo que está en la papelera no aparece en la búsqueda."
    />
  );
}

/** Pantalla `/buscar` (018 y 018b, mockup `storage/busqueda`): formulario, filtros y resultados con sus estados. */
export function SearchView({
  load,
  location,
}: {
  readonly load: LoadSearch;
  readonly location: SearchLocation;
}): React.JSX.Element {
  const search = useSearch(load, location);
  const space = useSpace();
  const { banner, ...sidebar } = useClientSidebar();
  return (
    <AppLayout
      navItems={SEARCH_NAV_ITEMS}
      {...sidebar}
      quotaCard={<SidebarQuota state={space.state} />}
    >
      <div className="mx-auto w-full max-w-5xl space-y-5">
        {banner}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Buscar</h1>
          <p className="text-sm text-secondary-foreground">
            Encuentra archivos y carpetas por su nombre, y documentos por las palabras que
            contienen. Sin distinguir mayúsculas ni acentos.
          </p>
        </header>
        <SearchForm initialText={search.q} onSubmit={search.submit} onType={search.type} />
        {search.q === '' ? (
          <SearchEntry />
        ) : (
          <>
            <SearchFilters
              filters={search.filters}
              activeFilters={search.activeFilters}
              invalidRange={search.invalidRange}
              onChange={search.changeFilters}
              onClear={search.clearFilters}
            />
            <SearchBody search={search} />
          </>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * La dirección de `/buscar`: cada búsqueda enviada o filtro es una entrada del historial, sin saltar al inicio (CA-12);
 * lo buscado mientras se escribe reemplaza la entrada actual.
 */
function useSearchLocation(): SearchLocation {
  const params = useSearchParams();
  const router = useRouter();
  return {
    search: params.toString(),
    navigate: (search, options) => {
      const href = search === '' ? SEARCH_PATH : `${SEARCH_PATH}?${search}`;
      if (options?.replace === true) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
  };
}

/** La pantalla conectada a `GET /search` con la sesión en memoria (002); `useAuthFetch` es estable entre renders. */
export function SessionSearchView({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  const authFetch = useAuthFetch();
  const load = React.useMemo<LoadSearch>(() => {
    const http = createStorageHttp(apiPublicUrl, authFetch);
    return (request) => fetchSearchPage(http, request);
  }, [apiPublicUrl, authFetch]);
  return <SearchView load={load} location={useSearchLocation()} />;
}
