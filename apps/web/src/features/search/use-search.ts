'use client';

import type { SearchResponse } from '@nimbo/contracts';
import * as React from 'react';

import type { MoreStatus } from '../storage/hooks/use-folder-contents';

import {
  fetchSearchPage,
  IDLE,
  listingOf,
  nextCursorOf,
  visiblePages,
  withMore,
  withoutMoreError,
  withPage,
  type Applied,
  type NextPage,
  type PageState,
  type SearchListing,
} from './search-pages';
import {
  activeFilterCount,
  isInvalidRange,
  NO_SEARCH_FILTERS,
  readSearchState,
  toSearchRequest,
  writeSearchState,
  type SearchFilters,
  type SearchRequest,
  type SearchState,
} from './search-url';

export { fetchSearchPage };
export type { SearchListing, SearchRequest };

/** `GET /search` (plan §4); debe ser estable entre renders (cada referencia nueva vuelve a pedir). */
export type LoadSearch = (request: SearchRequest) => Promise<SearchResponse>;

/** La dirección de la página: `search` sin `?` y `navigate`, que la cambia con una entrada nueva del historial. */
export interface SearchLocation {
  readonly search: string;
  readonly navigate: (search: string) => void;
}

export interface Search {
  readonly q: string;
  readonly filters: SearchFilters;
  readonly activeFilters: number;
  readonly listing: SearchListing;
  /** «Hasta» anterior a «Desde»: no se consulta (CA-9). */
  readonly invalidRange: boolean;
  /** La lista visible es la de la consulta anterior a un rango inválido: ya no corresponde a los filtros (CA-9). */
  readonly stale: boolean;
  readonly more: MoreStatus;
  /** Resultados que agregó la última página. */
  readonly added: number;
  readonly hasMore: boolean;
  /** Busca el texto recortado; `false` si queda vacío y no se buscó (CA-6). */
  readonly submit: (text: string) => boolean;
  readonly changeFilters: (patch: Partial<SearchFilters>) => void;
  readonly clearFilters: () => void;
  readonly retry: () => void;
  readonly loadMore: () => void;
  readonly dismissMoreError: () => void;
}

type SetPages = React.Dispatch<React.SetStateAction<PageState | null>>;

type Pages = Pick<
  Search,
  'listing' | 'stale' | 'more' | 'added' | 'hasMore' | 'loadMore' | 'dismissMoreError'
>;

/** Primera página de cada consulta; la respuesta de una consulta anterior se descarta. */
function useFirstPage(load: LoadSearch, applied: Applied | null, setPages: SetPages): void {
  React.useEffect(() => {
    if (applied === null) return undefined;
    let current = true;
    const settle = (listing: SearchListing): void => {
      if (current) setPages({ applied, listing, more: 'idle', added: 0 });
    };
    load(applied.request).then(
      (page) => settle(listingOf(page)),
      () => settle({ status: 'error' }),
    );
    return () => {
      current = false;
    };
  }, [load, applied, setPages]);
}

function requestNextPage(load: LoadSearch, next: NextPage, setPages: SetPages): void {
  setPages((previous) => withMore(previous, next, 'loading'));
  load({ ...next.applied.request, cursor: next.cursor }).then(
    (page) => setPages((previous) => withPage(previous, next, page)),
    () => setPages((previous) => withMore(previous, next, 'error')),
  );
}

/** Páginas acumuladas de la consulta `applied`; cambiarla vuelve a «cargando». */
function usePages(load: LoadSearch, applied: Applied | null, keepPrevious: boolean): Pages {
  const [pages, setPages] = React.useState<PageState | null>(null);
  useFirstPage(load, applied, setPages);
  const current = visiblePages(pages, applied, keepPrevious);
  const listing = current?.listing ?? IDLE;
  const cursor = applied === null ? null : nextCursorOf(current);
  return {
    listing,
    stale: applied === null && listing.status === 'data',
    more: current?.more ?? 'idle',
    added: current?.added ?? 0,
    hasMore: listing.status === 'data' && listing.nextCursor !== null,
    loadMore: () => {
      if (applied !== null && cursor !== null) requestNextPage(load, { applied, cursor }, setPages);
    },
    dismissMoreError: () => setPages(withoutMoreError),
  };
}

/** Cambios de la dirección: texto enviado, filtros y «Quitar filtros». */
function navigationOf(
  state: SearchState,
  location: SearchLocation,
  retry: () => void,
): Pick<Search, 'submit' | 'changeFilters' | 'clearFilters'> {
  const go = (next: SearchState): void => location.navigate(writeSearchState(next));
  return {
    submit: (text) => {
      const next = { ...state, q: text.trim() };
      if (next.q === '') return false;
      if (writeSearchState(next) === location.search) retry();
      else go(next);
      return true;
    },
    changeFilters: (patch) => go({ ...state, filters: { ...state.filters, ...patch } }),
    clearFilters: () => go({ ...state, filters: NO_SEARCH_FILTERS }),
  };
}

/**
 * Datos de la búsqueda (018 CA-3, CA-6, CA-8, CA-9, CA-12): el texto y los filtros viven en la dirección, así que
 * recargar o volver atrás repite la búsqueda. Sin texto o con un rango inválido no se consulta; «Cargar más» conserva
 * lo visible (patrón de `use-activity`, 004).
 */
export function useSearch(load: LoadSearch, location: SearchLocation): Search {
  const state = React.useMemo(() => readSearchState(location.search), [location.search]);
  const [attempt, setAttempt] = React.useState(0);
  const applied = React.useMemo(() => {
    const request = toSearchRequest(state, new Date());
    return request === null ? null : { request, attempt };
  }, [state, attempt]);
  const invalidRange = isInvalidRange(state.filters);
  const retry = (): void => setAttempt((previous) => previous + 1);
  return {
    ...usePages(load, applied, invalidRange),
    ...navigationOf(state, location, retry),
    q: state.q,
    filters: state.filters,
    activeFilters: activeFilterCount(state.filters),
    invalidRange,
    retry,
  };
}
