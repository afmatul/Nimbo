'use client';

import {
  BACKOFFICE_ERROR_CODES,
  SHARED_ERROR_CODES,
  type ClientFilesResponse,
} from '@nimbo/contracts';
import * as React from 'react';

import { ApiClientError } from '../../../lib/api-error';
import type { ClientFilesRequest } from '../api';

export type { ClientFilesRequest };

/** `GET /backoffice/client-files`; debe ser estable entre renders (cada referencia nueva vuelve a pedir). */
export type LoadClientFiles = (request: ClientFilesRequest) => Promise<ClientFilesResponse>;

/**
 * `idle`: antes de buscar (inicial); `found` con `paging` mientras llega otra página (lo visible se conserva);
 * `notFound`: correo inexistente o de una interna, el mismo 404 (003 D-6); `forbidden`: 403 (CA-14).
 */
export type ClientFilesState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'found'; readonly result: ClientFilesResponse; readonly paging: boolean }
  | { readonly status: 'notFound'; readonly email: string }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error' };

export interface ClientFiles {
  readonly state: ClientFilesState;
  readonly search: (email: string) => void;
  readonly goToPage: (page: number) => void;
  readonly retry: () => void;
  readonly clear: () => void;
}

const FIRST_PAGE = 1;

function failureOf(caught: unknown, email: string): ClientFilesState {
  if (!(caught instanceof ApiClientError)) return { status: 'error' };
  if (caught.code === BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND) return { status: 'notFound', email };
  if (caught.code === SHARED_ERROR_CODES.FORBIDDEN) return { status: 'forbidden' };
  return { status: 'error' };
}

/** Pide cada consulta nueva; la respuesta de una consulta anterior (o ya limpiada) se descarta. */
function useRequest(
  load: LoadClientFiles,
  request: ClientFilesRequest | null,
  setState: React.Dispatch<React.SetStateAction<ClientFilesState>>,
): void {
  React.useEffect(() => {
    if (request === null) return undefined;
    let current = true;
    const settle = (next: ClientFilesState): void => {
      if (current) setState(next);
    };
    load(request).then(
      (result) => settle({ status: 'found', result, paging: false }),
      (caught: unknown) => settle(failureOf(caught, request.email)),
    );
    return () => {
      current = false;
    };
  }, [load, request, setState]);
}

/**
 * Metadatos de los archivos de un cliente (011 CA-13, CA-14, CA-17): búsqueda por correo exacto, páginas por número
 * (DF-66) y sus estados. Empieza en el estado inicial, sin pedir nada.
 */
export function useClientFiles(load: LoadClientFiles): ClientFiles {
  const [request, setRequest] = React.useState<ClientFilesRequest | null>(null);
  const [state, setState] = React.useState<ClientFilesState>({ status: 'idle' });
  useRequest(load, request, setState);
  const restart = (next: ClientFilesRequest | null, nextState: ClientFilesState): void => {
    setRequest(next);
    setState(nextState);
  };
  return {
    state,
    search: (email) => restart({ email, page: FIRST_PAGE }, { status: 'loading' }),
    goToPage: (page) => {
      if (state.status !== 'found' || state.paging || request === null) return;
      restart({ email: request.email, page }, { ...state, paging: true });
    },
    retry: () => restart(request === null ? null : { ...request }, { status: 'loading' }),
    clear: () => restart(null, { status: 'idle' }),
  };
}
