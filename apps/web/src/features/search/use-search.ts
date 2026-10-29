'use client';

import { searchResponseSchema, type SearchHit, type SearchResponse } from '@nimbo/contracts';
import * as React from 'react';

import type { MoreStatus } from '../storage/hooks/use-folder-contents';
import { parseResponse, type StorageHttp } from '../storage/storage-http';

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

export type { SearchRequest };

/** `GET /search` (plan §4); debe ser estable entre renders (cada referencia nueva vuelve a pedir). */
export type LoadSearch = (request: SearchRequest) => Promise<SearchResponse>;

/** La dirección de la página: `search` sin `?` y `navigate`, que la cambia con una entrada nueva del historial. */
export interface SearchLocation {
  readonly search: string;
  readonly navigate: (search: string) => void;
}

/** `idle`: sin texto, no se busca (CA-6); `empty`: sin coincidencias (CA-11). */
export type SearchListing =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | {
      readonly status: 'data';
      readonly items: readonly SearchHit[];
      readonly nextCursor: string | null;
    };

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

/** `GET /search` con los parámetros presentes, validado con el contrato. */
export async function fetchSearchPage(
  http: StorageHttp,
  request: SearchRequest,
): Promise<SearchResponse> {
  const params = Object.entries(request).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  const raw = await http.get(`/search?${new URLSearchParams(params).toString()}`);
  return parseResponse(raw, searchResponseSchema);
}

/** Consulta vigente; cada objeto nuevo es una petición nueva (otra dirección o «Reintentar»). */
interface Applied {
  readonly request: SearchRequest;
  readonly attempt: number;
}

interface PageState {
  readonly applied: Applied;
  readonly listing: SearchListing;
  readonly more: MoreStatus;
  readonly added: number;
}

type SetPages = React.Dispatch<React.SetStateAction<PageState | null>>;

interface NextPage {
  readonly applied: Applied;
  readonly cursor: string;
}

type Pages = Pick<
  Search,
  'listing' | 'stale' | 'more' | 'added' | 'hasMore' | 'loadMore' | 'dismissMoreError'
>;

const IDLE: SearchListing = { status: 'idle' };
const LOADING: SearchListing = { status: 'loading' };

const listingOf = (page: SearchResponse): SearchListing =>
  page.items.length > 0 ? { status: 'data', ...page } : { status: 'empty' };

function isNextOf(state: PageState | null, next: NextPage): state is PageState {
  return (
    state?.applied === next.applied &&
    state.listing.status === 'data' &&
    state.listing.nextCursor === next.cursor
  );
}

function withMore(state: PageState | null, next: NextPage, more: MoreStatus): PageState | null {
  return isNextOf(state, next) ? { ...state, more } : state;
}

function withPage(state: PageState | null, next: NextPage, page: SearchResponse): PageState | null {
  if (!isNextOf(state, next) || state.listing.status !== 'data') return state;
  const items = [...state.listing.items, ...page.items];
  const listing: SearchListing = { status: 'data', items, nextCursor: page.nextCursor };
  return { ...state, listing, more: 'idle', added: page.items.length };
}

function withoutMoreError(state: PageState | null): PageState | null {
  return state?.more === 'error' ? { ...state, more: 'idle' } : state;
}

/** Cursor de la página siguiente si se puede pedir: hay más y no se está pidiendo. */
function nextCursorOf(state: PageState | null): string | null {
  if (state?.listing.status !== 'data' || state.more === 'loading') return null;
  return state.listing.nextCursor;
}

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

/** Lo que se ve: la consulta vigente, la anterior si un rango inválido la detuvo (`keepPrevious`) o la entrada. */
function visiblePages(
  pages: PageState | null,
  applied: Applied | null,
  keepPrevious: boolean,
): PageState | null {
  if (applied === null) return keepPrevious ? pages : null;
  return pages?.applied === applied ? pages : { applied, listing: LOADING, more: 'idle', added: 0 };
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
