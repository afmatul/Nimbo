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

/** Carpeta o archivo que se abre (y cuenta como reciente). */
export interface QuickAccessNode {
  readonly type: QuickAccessNodeType;
  readonly id: string;
}

/** Carpeta o archivo que se fija o se quita: el nombre es para el aviso si falla. */
export interface NamedQuickAccessNode extends QuickAccessNode {
  readonly name: string;
}

/** Fijar o quitar falló por algo que no es el tope (404, red, 429…): la página lo avisa arriba de la lista. */
export interface QuickAccessFailure {
  readonly action: 'pin' | 'unpin';
  readonly name: string;
  readonly error: unknown;
  readonly retry: () => void;
  /** Vuelve a leer los accesos rápidos (p. ej. si el elemento ya no existe). */
  readonly refresh: () => void;
}

/** `null` al empezar otro intento: el aviso anterior deja de valer. */
export type QuickAccessFailureListener = (failure: QuickAccessFailure | null) => void;

export interface QuickAccess {
  readonly state: QuickAccessState;
  readonly reload: () => void;
  /** Según los fijados de `GET /quick-access` (plan §9.2: `NodeSummary` no cambia). */
  readonly isPinned: (node: QuickAccessNode) => boolean;
  /** Un fallo que no es el tope llega a `onFailure`. */
  readonly pin: (node: NamedQuickAccessNode) => Promise<void>;
  /** `false` si la API no lo quitó; el fallo llega a `onFailure`. */
  readonly unpin: (node: NamedQuickAccessNode) => Promise<boolean>;
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

interface PinningOptions extends ListControls {
  readonly onFailure: QuickAccessFailureListener;
}

/** Fijar; el sexto fijado deja el tope en `limit` y no cambia nada (CA-28). Otro fallo va a `onFailure`. */
function usePin(api: QuickAccessApi, { reload, onFailure }: PinningOptions) {
  const [limit, setLimit] = React.useState<number | null>(null);

  const pin = async (node: NamedQuickAccessNode): Promise<void> => {
    setLimit(null);
    onFailure(null);
    try {
      await attempt(() => api.pin(node.type, node.id));
    } catch (error) {
      const maxPinned = limitOf(error);
      if (maxPinned !== null) return setLimit(maxPinned);
      const retry = (): void => void pin(node);
      return onFailure({ action: 'pin', name: node.name, error, retry, refresh: reload });
    }
    reload();
  };

  return { pin, limit, dismissLimit: () => setLimit(null) };
}

/** Quitar: sale de la lista sin esperar a releerla; un fallo va a `onFailure`. */
function useUnpin(api: QuickAccessApi, { setState, reload, onFailure }: PinningOptions) {
  const unpin = async (node: NamedQuickAccessNode): Promise<boolean> => {
    onFailure(null);
    try {
      await attempt(() => api.unpin(node.type, node.id));
    } catch (error) {
      const retry = (): void => void unpin(node);
      onFailure({ action: 'unpin', name: node.name, error, retry, refresh: reload });
      return false;
    }
    setState((previous) => withoutPinned(previous, node));
    reload();
    return true;
  };
  return unpin;
}

/**
 * Accesos rápidos de la cuenta. Al montar la página de una carpeta (`openedFolderId`) la registra como reciente antes de
 * leer la lista (Q-3: por URL, migas, barra o «Ver más»; desglosar en la lista no la registra).
 */
export function useQuickAccess(
  api: QuickAccessApi,
  openedFolderId: string | null,
  onFailure: QuickAccessFailureListener,
): QuickAccess {
  const list = useQuickAccessList(api);
  const { state, reload } = list;
  const pinning = usePin(api, { ...list, onFailure });
  const unpin = useUnpin(api, { ...list, onFailure });

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

  return { state, reload, isPinned, recordOpen, unpin, ...pinning };
}
