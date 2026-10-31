import { searchResponseSchema } from '@nimbo/contracts';
import type { SearchHit, SearchResponse } from '@nimbo/contracts';

import type { MoreStatus } from '../storage/hooks/use-folder-contents';
import { parseResponse, type StorageHttp } from '../storage/storage-http';

import type { SearchRequest } from './search-url';

/** Páginas acumuladas de una búsqueda (018 CA-3): tipos y transiciones puras; los efectos viven en `use-search.ts`. */

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
export interface Applied {
  readonly request: SearchRequest;
  readonly attempt: number;
}

export interface PageState {
  readonly applied: Applied;
  readonly listing: SearchListing;
  readonly more: MoreStatus;
  readonly added: number;
}

export interface NextPage {
  readonly applied: Applied;
  readonly cursor: string;
}

export const IDLE: SearchListing = { status: 'idle' };
const LOADING: SearchListing = { status: 'loading' };

export const listingOf = (page: SearchResponse): SearchListing =>
  page.items.length > 0 ? { status: 'data', ...page } : { status: 'empty' };

function isNextOf(state: PageState | null, next: NextPage): state is PageState {
  return (
    state?.applied === next.applied &&
    state.listing.status === 'data' &&
    state.listing.nextCursor === next.cursor
  );
}

export function withMore(
  state: PageState | null,
  next: NextPage,
  more: MoreStatus,
): PageState | null {
  return isNextOf(state, next) ? { ...state, more } : state;
}

export function withPage(
  state: PageState | null,
  next: NextPage,
  page: SearchResponse,
): PageState | null {
  if (!isNextOf(state, next) || state.listing.status !== 'data') return state;
  const items = [...state.listing.items, ...page.items];
  const listing: SearchListing = { status: 'data', items, nextCursor: page.nextCursor };
  return { ...state, listing, more: 'idle', added: page.items.length };
}

export function withoutMoreError(state: PageState | null): PageState | null {
  return state?.more === 'error' ? { ...state, more: 'idle' } : state;
}

/** Cursor de la página siguiente si se puede pedir: hay más y no se está pidiendo. */
export function nextCursorOf(state: PageState | null): string | null {
  if (state?.listing.status !== 'data' || state.more === 'loading') return null;
  return state.listing.nextCursor;
}

/** Lo que se ve: la consulta vigente, la anterior si un rango inválido la detuvo (`keepPrevious`) o la entrada. */
export function visiblePages(
  pages: PageState | null,
  applied: Applied | null,
  keepPrevious: boolean,
): PageState | null {
  if (applied === null) return keepPrevious ? pages : null;
  return pages?.applied === applied ? pages : { applied, listing: LOADING, more: 'idle', added: 0 };
}
