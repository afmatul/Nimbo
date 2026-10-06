'use client';

import type {
  AuditEventResponse,
  AuditOrigin,
  ListAuditEventsQuery,
  ListAuditEventsResponse,
} from '@nimbo/contracts';
import * as React from 'react';

import { toApiClientError } from '../../../lib/api-error';
import type { MoreStatus } from '../../storage/hooks/use-folder-contents';

/** Origen elegido en el filtro: «Todo» no manda `origin` (D-8, sin subfiltro de roles). */
export type ActivityOriginFilter = 'all' | AuditOrigin;

/** Filtros de la pantalla; `fromDay` y `toDay` son días locales `AAAA-MM-DD` del `input type=date`, o `''`. */
export interface ActivityFilters {
  readonly origin: ActivityOriginFilter;
  readonly fromDay: string;
  readonly toDay: string;
}

export const NO_ACTIVITY_FILTERS: ActivityFilters = { origin: 'all', fromDay: '', toDay: '' };

/** `empty`: la cuenta no tiene actividad; `filteredEmpty`: nada cumple los filtros (CA-10, CA-11). */
export type ActivityListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly correlationId: string }
  | { readonly status: 'empty' }
  | { readonly status: 'filteredEmpty' }
  | {
      readonly status: 'data';
      readonly items: readonly AuditEventResponse[];
      readonly nextCursor: string | null;
    };

/** `GET /audit/my-events`; debe ser estable entre renders (cada referencia nueva vuelve a pedir). */
export type LoadActivity = (query: ListAuditEventsQuery) => Promise<ListAuditEventsResponse>;

export interface Activity {
  readonly listing: ActivityListing;
  readonly filters: ActivityFilters;
  readonly hasFilters: boolean;
  /** «Hasta» anterior a «Desde»: no se consulta y lo visible se conserva. */
  readonly invalidRange: boolean;
  readonly more: MoreStatus;
  readonly hasMore: boolean;
  readonly changeFilters: (patch: Partial<ActivityFilters>) => void;
  readonly clearFilters: () => void;
  /** Vuelve a pedir la primera página tras un error de carga. */
  readonly retry: () => void;
  /** Pide la página siguiente; tras un error de «Cargar más», la reintenta. */
  readonly loadMore: () => void;
}

/** Consulta vigente; cada objeto nuevo es una petición nueva (filtro o «Reintentar»). */
interface Applied {
  readonly query: ListAuditEventsQuery;
}

interface PageState {
  readonly applied: Applied;
  readonly listing: ActivityListing;
  readonly more: MoreStatus;
}

type SetPages = React.Dispatch<React.SetStateAction<PageState | null>>;

/** La página pedida con `cursor` para la consulta `applied`. */
interface NextPage {
  readonly applied: Applied;
  readonly cursor: string;
}

const LOADING: ActivityListing = { status: 'loading' };

function hasActiveFilters({ origin, fromDay, toDay }: ActivityFilters): boolean {
  return origin !== 'all' || fromDay !== '' || toDay !== '';
}

/** Un día «Hasta» igual a «Desde» es válido: abarca ese día entero. */
function isInvalidRange({ fromDay, toDay }: ActivityFilters): boolean {
  return fromDay !== '' && toDay !== '' && toDay < fromDay;
}

/** Medianoche local de `day` más `offsetDays`, como instante UTC: el servidor no conoce la zona del navegador. */
function localDayStart(day: string, offsetDays: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date + offsetDays).toISOString();
}

/** `from` inclusivo al inicio de «Desde» y `to` exclusivo al inicio del día siguiente a «Hasta» (plan 004 §4). */
export function toActivityQuery(filters: ActivityFilters): ListAuditEventsQuery {
  const { origin, fromDay, toDay } = filters;
  return {
    ...(origin === 'all' ? {} : { origin }),
    ...(fromDay === '' ? {} : { from: localDayStart(fromDay, 0) }),
    ...(toDay === '' ? {} : { to: localDayStart(toDay, 1) }),
  };
}

function listingOf(page: ListAuditEventsResponse, query: ListAuditEventsQuery): ActivityListing {
  if (page.items.length > 0) return { status: 'data', ...page };
  return Object.keys(query).length > 0 ? { status: 'filteredEmpty' } : { status: 'empty' };
}

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

function withPage(
  state: PageState | null,
  next: NextPage,
  page: ListAuditEventsResponse,
): PageState | null {
  if (!isNextOf(state, next) || state.listing.status !== 'data') return state;
  const items = [...state.listing.items, ...page.items];
  return {
    ...state,
    listing: { status: 'data', items, nextCursor: page.nextCursor },
    more: 'idle',
  };
}

/** Cursor de la página siguiente si se puede pedir: hay más y no se está pidiendo. */
function nextCursorOf(state: PageState): string | null {
  if (state.listing.status !== 'data' || state.more === 'loading') return null;
  return state.listing.nextCursor;
}

/** Primera página de cada consulta; la respuesta de una consulta anterior se descarta. */
function useFirstPage(load: LoadActivity, applied: Applied, setPages: SetPages): void {
  React.useEffect(() => {
    let current = true;
    const settle = (listing: ActivityListing): void => {
      if (current) setPages({ applied, listing, more: 'idle' });
    };
    load(applied.query).then(
      (page) => settle(listingOf(page, applied.query)),
      (error: unknown) =>
        settle({ status: 'error', correlationId: toApiClientError(error).correlationId }),
    );
    return () => {
      current = false;
    };
  }, [load, applied, setPages]);
}

function requestNextPage(load: LoadActivity, next: NextPage, setPages: SetPages): void {
  setPages((previous) => withMore(previous, next, 'loading'));
  load({ ...next.applied.query, cursor: next.cursor }).then(
    (page) => setPages((previous) => withPage(previous, next, page)),
    () => setPages((previous) => withMore(previous, next, 'error')),
  );
}

/** Páginas acumuladas de la consulta `applied`; cambiarla vuelve a «cargando». */
function usePages(
  load: LoadActivity,
  applied: Applied,
): Pick<Activity, 'listing' | 'more' | 'hasMore' | 'loadMore'> {
  const [pages, setPages] = React.useState<PageState | null>(null);
  useFirstPage(load, applied, setPages);
  const current: PageState =
    pages?.applied === applied ? pages : { applied, listing: LOADING, more: 'idle' };
  const cursor = nextCursorOf(current);
  return {
    listing: current.listing,
    more: current.more,
    hasMore: current.listing.status === 'data' && current.listing.nextCursor !== null,
    loadMore: () => {
      if (cursor !== null) requestNextPage(load, { applied, cursor }, setPages);
    },
  };
}

/** Filtros visibles y la consulta que generan; un rango inválido cambia los filtros pero no la consulta. */
function useFilters(): Pick<Activity, 'filters' | 'changeFilters' | 'clearFilters' | 'retry'> & {
  readonly applied: Applied;
} {
  const [filters, setFilters] = React.useState<ActivityFilters>(NO_ACTIVITY_FILTERS);
  const [applied, setApplied] = React.useState<Applied>(() => ({ query: {} }));
  return {
    filters,
    applied,
    changeFilters: (patch) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      if (!isInvalidRange(next)) setApplied({ query: toActivityQuery(next) });
    },
    clearFilters: () => {
      setFilters(NO_ACTIVITY_FILTERS);
      setApplied({ query: {} });
    },
    retry: () => setApplied((previous) => ({ query: previous.query })),
  };
}

/**
 * Datos de «Mi actividad» (004 CA-7, CA-9 a CA-11, CA-15): filtros, páginas acumuladas y sus estados. «Cargar más»
 * conserva lo visible (patrón de `use-folder-contents`); cambiar un filtro o «Reintentar» vuelve a «cargando».
 */
export function useActivity(load: LoadActivity): Activity {
  const { applied, ...filterActions } = useFilters();
  const pages = usePages(load, applied);
  return {
    ...pages,
    ...filterActions,
    hasFilters: hasActiveFilters(filterActions.filters),
    invalidRange: isInvalidRange(filterActions.filters),
  };
}
