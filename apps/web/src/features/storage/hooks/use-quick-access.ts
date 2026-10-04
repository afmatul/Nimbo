'use client';

import { STORAGE_ERROR_CODES, type QuickAccessList } from '@nimbo/contracts';
import * as React from 'react';

import type { QuickAccessApi, QuickAccessNodeType } from '../quick-access-api';
import { StorageRequestError } from '../storage-request-error';

/** Accesos rápidos de la barra lateral (006 CA-27): mientras cargan no se dibujan; un fallo es discreto. */
export type QuickAccessState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly list: QuickAccessList };

/** Carpeta o archivo que se fija, se quita o se abre. */
export interface QuickAccessNode {
  readonly type: QuickAccessNodeType;
  readonly id: string;
}

export interface QuickAccess {
  readonly state: QuickAccessState;
  readonly reload: () => void;
  /** Según los fijados de `GET /quick-access` (plan §9.2: `NodeSummary` no cambia). */
  readonly isPinned: (node: QuickAccessNode) => boolean;
  readonly pin: (node: QuickAccessNode) => Promise<void>;
  /** `false` si la API no lo quitó. */
  readonly unpin: (node: QuickAccessNode) => Promise<boolean>;
  /** Abrir una carpeta o descargar un archivo (Q-3), de mejor esfuerzo: un fallo no se muestra. */
  readonly recordOpen: (node: QuickAccessNode) => void;
  /** Tope del último intento de fijar de más (CA-28); `null` sin aviso. */
  readonly limit: number | null;
  readonly dismissLimit: () => void;
}

const LOADING: QuickAccessState = { status: 'loading' };
const FAILED: QuickAccessState = { status: 'error' };
const ignore = (): void => undefined;

/** Un fallo síncrono del cliente también llega como promesa rechazada. */
function attempt<T>(call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => resolve(call()));
}

function limitOf(error: unknown): number | null {
  const isLimit =
    error instanceof StorageRequestError &&
    error.code === STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT;
  return isLimit ? Number(error.details['maxPinned']) : null;
}

const sameNode = (a: QuickAccessNode, b: QuickAccessNode): boolean =>
  a.type === b.type && a.id === b.id;

function withoutPinned(state: QuickAccessState, node: QuickAccessNode): QuickAccessState {
  if (state.status !== 'ready') return state;
  const pinned = state.list.pinned.filter((item) => !sameNode(item, node));
  return { status: 'ready', list: { ...state.list, pinned } };
}

/** `GET /quick-access` con turno: una respuesta vieja no pisa a una nueva. */
function useQuickAccessList(api: QuickAccessApi) {
  const [state, setState] = React.useState<QuickAccessState>(LOADING);
  const lastTurn = React.useRef(0);
  const reload = React.useCallback(() => {
    lastTurn.current += 1;
    const turn = lastTurn.current;
    const settle = (next: QuickAccessState): void => {
      if (lastTurn.current === turn) setState(next);
    };
    attempt(() => api.quickAccess()).then(
      (list) => settle({ status: 'ready', list }),
      () => settle(FAILED),
    );
  }, [api]);
  return { state, setState, reload };
}

type ListControls = Pick<ReturnType<typeof useQuickAccessList>, 'setState' | 'reload'>;

/** Fijar y quitar; el sexto fijado deja el tope en `limit` y no cambia nada (CA-28). */
function usePinning(api: QuickAccessApi, { setState, reload }: ListControls) {
  const [limit, setLimit] = React.useState<number | null>(null);

  const pin = async (node: QuickAccessNode): Promise<void> => {
    setLimit(null);
    try {
      await attempt(() => api.pin(node.type, node.id));
    } catch (error) {
      const maxPinned = limitOf(error);
      if (maxPinned !== null) return setLimit(maxPinned);
    }
    reload();
  };

  const unpin = async (node: QuickAccessNode): Promise<boolean> => {
    try {
      await attempt(() => api.unpin(node.type, node.id));
    } catch {
      return false;
    }
    setState((previous) => withoutPinned(previous, node));
    reload();
    return true;
  };

  return { pin, unpin, limit, dismissLimit: () => setLimit(null) };
}

/**
 * Accesos rápidos de la cuenta. Al montar la página de una carpeta (`openedFolderId`) la registra como reciente antes de
 * leer la lista (Q-3: por URL, migas, barra o «Ver más»; desglosar en la lista no la registra).
 */
export function useQuickAccess(api: QuickAccessApi, openedFolderId: string | null): QuickAccess {
  const list = useQuickAccessList(api);
  const { state, reload } = list;
  const pinning = usePinning(api, list);

  const recordOpen = React.useCallback(
    (node: QuickAccessNode) => {
      attempt(() => api.recordRecent(node.type, node.id))
        .then(ignore, ignore)
        .then(reload, ignore);
    },
    [api, reload],
  );

  React.useEffect(() => {
    if (openedFolderId === null) reload();
    else recordOpen({ type: 'folder', id: openedFolderId });
  }, [openedFolderId, recordOpen, reload]);

  const isPinned = (node: QuickAccessNode): boolean =>
    state.status === 'ready' && state.list.pinned.some((item) => sameNode(item, node));

  return { state, reload, isPinned, recordOpen, ...pinning };
}
