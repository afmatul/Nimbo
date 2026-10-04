'use client';

import {
  STORAGE_ERROR_CODES,
  type FolderContentsResponse,
  type FolderSummary,
} from '@nimbo/contracts';
import * as React from 'react';

import type { FolderPageQuery } from '../folders-api';
import { DEFAULT_NODE_ORDER, sameOrder, type NodeOrder } from '../node-order';
import { StorageRequestError } from '../storage-request-error';

const HTTP_NOT_FOUND = 404;

/** `ready` lleva el orden en que vienen sus elementos (el que marca la tabla), que puede no ser el ya pedido. */
export type FolderListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'not_found' }
  | {
      readonly status: 'ready';
      readonly contents: FolderContentsResponse;
      readonly order: NodeOrder;
    };

/** `GET /folders/contents`: sin `page`, la primera página en el orden de 006 (el árbol de «Mover a…» y la barra lateral). */
export type LoadFolderContents = (
  folderId: string | null,
  page?: FolderPageQuery,
) => Promise<FolderContentsResponse>;

/** Estado de «Cargar más»: lista para pedir, pidiendo la página siguiente o falló (lo visible se conserva). */
export type MoreStatus = 'idle' | 'loading' | 'error';

/** Orden y paginación del listado abierto (007 CA-9, CA-10, CA-12). */
export interface ListControls {
  /** El orden pedido (el del menú). */
  readonly order: NodeOrder;
  /** El orden de los elementos visibles; difiere de `order` mientras llega la respuesta. */
  readonly shownOrder: NodeOrder;
  readonly sorting: boolean;
  readonly more: MoreStatus;
  /** Elementos que agregó la última página, para anunciarlo. */
  readonly added: number;
  readonly hasMore: boolean;
  readonly changeOrder: (order: NodeOrder) => void;
  readonly loadMore: () => void;
  readonly dismissMoreError: () => void;
}

const LOADING: FolderListing = { status: 'loading' };

/** `location` = carpeta e intento: cambiarla vuelve a «cargando»; cambiar el orden no (CA-12). */
interface ContentsState {
  readonly location: string;
  readonly listing: FolderListing;
  readonly more: MoreStatus;
  readonly added: number;
}

const IDLE = { more: 'idle', added: 0 } as const;

/**
 * Inexistente, ajena o en la papelera (`404`, CA-5 y CA-22) y un identificador que ni siquiera es UUID (`400` de la
 * consulta) se ven igual: «No encontramos esta carpeta».
 */
function isNotFound(error: unknown): boolean {
  return (
    error instanceof StorageRequestError &&
    (error.status === HTTP_NOT_FOUND || error.code === STORAGE_ERROR_CODES.STORAGE_INVALID_QUERY)
  );
}

function withNewFolder(listing: FolderListing, folder: FolderSummary): FolderListing {
  if (listing.status !== 'ready') return listing;
  const { contents } = listing;
  return {
    ...listing,
    contents: { ...contents, items: [{ type: 'folder', ...folder }, ...contents.items] },
  };
}

/** La página pedida con `cursor` sigue siendo la siguiente de lo visible (ni otro orden ni otra carpeta). */
function isNextOf(state: ContentsState, cursor: string): boolean {
  return state.listing.status === 'ready' && state.listing.contents.nextCursor === cursor;
}

function withMoreStatus(state: ContentsState, cursor: string, more: MoreStatus): ContentsState {
  return isNextOf(state, cursor) ? { ...state, more } : state;
}

/** Agrega la página al final, sin repetir lo que ya está (p. ej. una carpeta creada en esta pestaña). */
function appendPage(
  contents: FolderContentsResponse,
  page: FolderContentsResponse,
): { readonly contents: FolderContentsResponse; readonly added: number } {
  const seen = new Set(contents.items.map((item) => item.id));
  const fresh = page.items.filter((item) => !seen.has(item.id));
  const items = [...contents.items, ...fresh];
  return { contents: { ...contents, items, nextCursor: page.nextCursor }, added: fresh.length };
}

function withPage(
  state: ContentsState,
  cursor: string,
  page: FolderContentsResponse,
): ContentsState {
  const { listing } = state;
  if (listing.status !== 'ready' || !isNextOf(state, cursor)) return state;
  const { contents, added } = appendPage(listing.contents, page);
  return { ...state, listing: { ...listing, contents }, more: 'idle', added };
}

/** Elementos ya visibles en el orden pedido; con otro orden u otra carpeta, ninguno (se empieza de cero). */
function loadedCountOf(state: ContentsState, order: NodeOrder): number {
  const { listing } = state;
  if (listing.status !== 'ready' || !sameOrder(listing.order, order)) return 0;
  return listing.contents.items.length;
}

/** Sigue los `nextCursor` hasta reunir al menos `minItems` elementos o no haber más (007 CA-21). */
async function withPagesUpTo(
  request: PageRequest,
  contents: FolderContentsResponse,
  minItems: number,
): Promise<FolderContentsResponse> {
  const cursor = contents.nextCursor;
  if (cursor === null || contents.items.length >= minItems) return contents;
  const page = await request.load(request.folderId, { ...request.order, cursor });
  return withPagesUpTo(request, appendPage(contents, page).contents, minItems);
}

/** Cursor de la página siguiente si se puede pedir: hay más, no se está pidiendo y no hay otro orden en camino. */
function nextCursorOf(state: ContentsState, requested: NodeOrder): string | null {
  const { listing } = state;
  if (listing.status !== 'ready' || state.more === 'loading') return null;
  return sameOrder(listing.order, requested) ? listing.contents.nextCursor : null;
}

type SetContents = React.Dispatch<React.SetStateAction<ContentsState>>;

interface PageRequest {
  readonly load: LoadFolderContents;
  readonly folderId: string | null;
  readonly order: NodeOrder;
}

/**
 * Primera página en el orden pedido; la respuesta de una petición anterior (otro orden u otra carpeta) se descarta.
 * `refreshes` la vuelve a pedir sin pasar por «cargando»: lo visible se conserva hasta que llega y se vuelven a pedir
 * tantas páginas como había (`loaded`, 007 CA-21).
 */
function useFirstPage(
  request: PageRequest & {
    readonly location: string;
    readonly refreshes: number;
    readonly loaded: React.RefObject<number>;
  },
  setState: SetContents,
): void {
  const { load, folderId, order, location, refreshes, loaded } = request;
  React.useEffect(() => {
    let current = true;
    const settle = (listing: FolderListing): void => {
      if (current) setState({ location, listing, ...IDLE });
    };
    const pages = { load, folderId, order };
    load(folderId, { ...order })
      .then((first) => withPagesUpTo(pages, first, loaded.current))
      .then(
        (contents) => settle({ status: 'ready', contents, order }),
        (error: unknown) => settle({ status: isNotFound(error) ? 'not_found' : 'error' }),
      );
    return () => {
      current = false;
    };
  }, [load, folderId, order, location, refreshes, loaded, setState]);
}

function requestNextPage(
  request: PageRequest & { readonly cursor: string },
  setState: SetContents,
): void {
  const { load, folderId, order, cursor } = request;
  setState((previous) => withMoreStatus(previous, cursor, 'loading'));
  load(folderId, { ...order, cursor }).then(
    (page) => setState((previous) => withPage(previous, cursor, page)),
    () => setState((previous) => withMoreStatus(previous, cursor, 'error')),
  );
}

/** «Cargar más»: pide la página siguiente si se puede (`cursor` no nulo); si no, no hace nada. */
function loadMoreOf(
  request: PageRequest,
  cursor: string | null,
  setState: SetContents,
): () => void {
  return () => {
    if (cursor !== null) requestNextPage({ ...request, cursor }, setState);
  };
}

function controlsOf(
  state: ContentsState,
  order: NodeOrder,
): Omit<ListControls, 'changeOrder' | 'loadMore' | 'dismissMoreError'> {
  const { listing } = state;
  const shownOrder = listing.status === 'ready' ? listing.order : order;
  return {
    order,
    shownOrder,
    sorting: listing.status === 'ready' && !sameOrder(shownOrder, order),
    more: state.more,
    added: state.added,
    hasMore: listing.status === 'ready' && listing.contents.nextCursor !== null,
  };
}

/**
 * Listado de una carpeta o de la raíz (`null`), por páginas y en el orden elegido (por defecto, el de 006). Cambiar de
 * carpeta o «Reintentar» vuelve a «cargando»; cambiar el orden pide la primera página y conserva lo visible hasta que
 * llega; «Cargar más» acumula con `nextCursor`.
 */
export function useFolderContents(
  load: LoadFolderContents,
  folderId: string | null,
): {
  readonly listing: FolderListing;
  readonly reload: () => void;
  readonly refresh: () => void;
  readonly addFolder: (folder: FolderSummary) => void;
  readonly controls: ListControls;
} {
  const counters = useCounters();
  const [order, setOrder] = React.useState<NodeOrder>(DEFAULT_NODE_ORDER);
  const location = `${folderId ?? ''}#${String(counters.attempt)}`;
  const [state, setState] = React.useState<ContentsState>({
    location: '',
    listing: LOADING,
    ...IDLE,
  });
  const current = state.location === location ? state : { location, listing: LOADING, ...IDLE };
  const loaded = useLoadedCount(loadedCountOf(current, order));
  useFirstPage(
    { load, folderId, order, location, refreshes: counters.refreshes, loaded },
    setState,
  );
  const actions = useListActions(setState, setOrder, counters);
  const loadMore = loadMoreOf({ load, folderId, order }, nextCursorOf(current, order), setState);
  return {
    listing: current.listing,
    reload: actions.reload,
    refresh: actions.refresh,
    addFolder: actions.addFolder,
    controls: { ...controlsOf(current, order), ...actions.controls, loadMore },
  };
}

/** Lo visible al momento de releer; se lee desde el efecto sin volver a disparar la petición. */
function useLoadedCount(count: number): React.RefObject<number> {
  const loaded = React.useRef(count);
  React.useEffect(() => {
    loaded.current = count;
  }, [count]);
  return loaded;
}

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/**
 * `attempt` vuelve a «cargando» (carpeta nueva o «Reintentar»); `refreshes` solo relee la primera página, sin perder
 * lo visible (el listado ordenado por el servidor tras subir, renombrar o mover, I-1).
 */
interface Counters {
  readonly attempt: number;
  readonly refreshes: number;
  readonly setAttempt: Setter<number>;
  readonly setRefreshes: Setter<number>;
}

function useCounters(): Counters {
  const [attempt, setAttempt] = React.useState(0);
  const [refreshes, setRefreshes] = React.useState(0);
  return { attempt, refreshes, setAttempt, setRefreshes };
}

function useListActions(
  setState: SetContents,
  setOrder: Setter<NodeOrder>,
  counters: Counters,
): {
  readonly reload: () => void;
  readonly refresh: () => void;
  readonly addFolder: (folder: FolderSummary) => void;
  readonly controls: Pick<ListControls, 'changeOrder' | 'dismissMoreError'>;
} {
  const { setAttempt, setRefreshes } = counters;
  return React.useMemo(
    () => ({
      reload: () => setAttempt((previous) => previous + 1),
      refresh: () => setRefreshes((previous) => previous + 1),
      addFolder: (folder: FolderSummary) =>
        setState((previous) => ({ ...previous, listing: withNewFolder(previous.listing, folder) })),
      controls: {
        changeOrder: (next: NodeOrder) =>
          setOrder((previous) => (sameOrder(previous, next) ? previous : next)),
        dismissMoreError: () =>
          setState((previous) =>
            previous.more === 'error' ? { ...previous, more: 'idle' } : previous,
          ),
      },
    }),
    [setState, setOrder, setAttempt, setRefreshes],
  );
}
