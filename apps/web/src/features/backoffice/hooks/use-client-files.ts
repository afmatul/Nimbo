'use client';

import { BACKOFFICE_ERROR_CODES, type ClientFilesResponse } from '@nimbo/contracts';
import * as React from 'react';

import type { ClientFilesRequest } from '../api';

import {
  hasErrorCode,
  isForbidden,
  useLatestRequest,
  type RequestOutcome,
} from './use-latest-request';

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
  if (hasErrorCode(caught, BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND))
    return { status: 'notFound', email };
  return isForbidden(caught) ? { status: 'forbidden' } : { status: 'error' };
}

function toClientFilesState(
  outcome: RequestOutcome<ClientFilesResponse>,
  request: ClientFilesRequest,
): ClientFilesState {
  if (outcome.ok) return { status: 'found', result: outcome.value, paging: false };
  return failureOf(outcome.error, request.email);
}

/**
 * Metadatos de los archivos de un cliente (011 CA-13, CA-14, CA-17): búsqueda por correo exacto, páginas por número
 * (DF-66) y sus estados. Sin `initialEmail` empieza en el estado inicial, sin pedir nada; con él (el Administrador
 * llega desde la ficha, `desde-admin`), pide la primera página de ese cliente al montar.
 */
export function useClientFiles(load: LoadClientFiles, initialEmail?: string): ClientFiles {
  const [request, setRequest] = React.useState<ClientFilesRequest | null>(() =>
    initialEmail === undefined ? null : { email: initialEmail, page: FIRST_PAGE },
  );
  const [state, setState] = React.useState<ClientFilesState>(() =>
    initialEmail === undefined ? { status: 'idle' } : { status: 'loading' },
  );
  useLatestRequest({ load, request, toState: toClientFilesState, setState });
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
