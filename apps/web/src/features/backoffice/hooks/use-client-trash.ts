'use client';

import { BACKOFFICE_ERROR_CODES, type ClientTrashResponse, type TrashItem } from '@nimbo/contracts';
import * as React from 'react';

import type { MoreStatus } from '../../storage/hooks/use-folder-contents';
import type { ClientTrashRequest } from '../api';
import type { TrashNotice } from '../trash-notices';

import {
  hasErrorCode,
  isForbidden,
  useLatestRequest,
  type RequestOutcome,
} from './use-latest-request';

export type { ClientTrashRequest };

/** `GET /backoffice/client-trash`; debe ser estable entre renders (cada referencia nueva vuelve a pedir). */
export type LoadClientTrash = (request: ClientTrashRequest) => Promise<ClientTrashResponse>;

/**
 * `idle`: antes de buscar; `ready`: el cliente con las raíces de su papelera (puede estar vacía) y el último aviso de
 * una restauración; `notFound`: correo inexistente o de una interna, el mismo 404 (003 D-6); `forbidden`: 403 (CA-14).
 */
export type ClientTrashState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly client: ClientTrashResponse['client'];
      readonly items: readonly TrashItem[];
      readonly nextCursor: string | null;
      readonly more: MoreStatus;
      /** Elementos que agregó la última página, para anunciarlo. */
      readonly added: number;
      readonly notice: TrashNotice | null;
    }
  | { readonly status: 'notFound'; readonly email: string }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error' };

type ReadyState = Extract<ClientTrashState, { status: 'ready' }>;

export interface ClientTrash {
  readonly state: ClientTrashState;
  readonly search: (email: string) => void;
  readonly loadMore: () => void;
  readonly dismissMoreError: () => void;
  readonly retry: () => void;
  readonly clear: () => void;
  /** Una raíz ya no está en la lista (restaurada, o `404`): la quita y deja el aviso. */
  readonly settle: (item: TrashItem, notice: TrashNotice) => void;
  readonly dismissNotice: () => void;
}

function failureOf(caught: unknown, email: string): ClientTrashState {
  if (hasErrorCode(caught, BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND))
    return { status: 'notFound', email };
  return isForbidden(caught) ? { status: 'forbidden' } : { status: 'error' };
}

function toClientTrashState(
  outcome: RequestOutcome<ClientTrashResponse>,
  request: ClientTrashRequest,
): ClientTrashState {
  if (!outcome.ok) return failureOf(outcome.error, request.email);
  const { client, items, nextCursor } = outcome.value;
  return { status: 'ready', client, items, nextCursor, more: 'idle', added: 0, notice: null };
}

/** Une la página nueva a lo ya visible; los repetidos (una raíz restaurada entre páginas) no se duplican. */
function withPage(state: ReadyState, page: ClientTrashResponse): ReadyState {
  const known = new Set(state.items.map((item) => item.id));
  const fresh = page.items.filter((item) => !known.has(item.id));
  const items = [...state.items, ...fresh];
  return { ...state, items, nextCursor: page.nextCursor, more: 'idle', added: fresh.length };
}

/** Pide la página siguiente; la respuesta de una búsqueda anterior se descarta (`token`). */
function useMorePage(
  load: LoadClientTrash,
  setState: React.Dispatch<React.SetStateAction<ClientTrashState>>,
) {
  const token = React.useRef(0);
  const mount = React.useCallback(
    (update: (state: ReadyState) => ReadyState): void =>
      setState((current) => (current.status === 'ready' ? update(current) : current)),
    [setState],
  );
  const loadMore = (state: ReadyState): void => {
    if (state.more === 'loading' || state.nextCursor === null) return;
    const mine = token.current;
    mount((ready) => ({ ...ready, more: 'loading' }));
    const settle = (update: (ready: ReadyState) => ReadyState): void => {
      if (token.current === mine) mount(update);
    };
    void load({ email: state.client.email, cursor: state.nextCursor }).then(
      (page) => settle((ready) => withPage(ready, page)),
      () => settle((ready) => ({ ...ready, more: 'error' })),
    );
  };
  return {
    loadMore,
    discard: (): void => {
      token.current += 1;
    },
  };
}

/**
 * Papelera de un cliente para Soporte (011b CA-10, CA-12, CA-17): búsqueda por correo exacto, raíces con «Cargar más»
 * (cursor) y los aviso de cada restauración. Sin correo empieza en `idle`, sin pedir nada.
 */
export function useClientTrash(load: LoadClientTrash): ClientTrash {
  const [request, setRequest] = React.useState<ClientTrashRequest | null>(null);
  const [state, setState] = React.useState<ClientTrashState>({ status: 'idle' });
  useLatestRequest({ load, request, toState: toClientTrashState, setState });
  const page = useMorePage(load, setState);
  const restart = (next: ClientTrashRequest | null, nextState: ClientTrashState): void => {
    page.discard();
    setRequest(next);
    setState(nextState);
  };
  const ready = (update: (current: ReadyState) => ReadyState): void =>
    setState((current) => (current.status === 'ready' ? update(current) : current));
  return {
    state,
    search: (email) => restart({ email }, { status: 'loading' }),
    loadMore: () => state.status === 'ready' && page.loadMore(state),
    dismissMoreError: () => ready((current) => ({ ...current, more: 'idle' })),
    retry: () => restart(request === null ? null : { ...request }, { status: 'loading' }),
    clear: () => restart(null, { status: 'idle' }),
    settle: (item, notice) =>
      ready((current) => ({
        ...current,
        items: current.items.filter((other) => other.id !== item.id),
        notice,
        added: 0,
      })),
    dismissNotice: () => ready((current) => ({ ...current, notice: null })),
  };
}
