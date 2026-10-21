'use client';

import type { AccountListResponse } from '@nimbo/contracts';
import * as React from 'react';

import type { AccountsRequest } from '../api';

import { isForbidden, useLatestRequest, type RequestOutcome } from './use-latest-request';

/** `GET /backoffice/accounts`; debe ser estable entre renders. */
export type LoadAccounts = (request: AccountsRequest) => Promise<AccountListResponse>;

/** `ready` con `paging` mientras llega otra página (lo visible se conserva); `forbidden`: 403 (CA-14). */
export type AccountsState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly result: AccountListResponse;
      /** Inicio del correo buscado; `undefined`, la lista completa. */
      readonly email: string | undefined;
      readonly paging: boolean;
    }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error' };

export interface Accounts {
  readonly state: AccountsState;
  /** Busca por el inicio del correo ya normalizado; `undefined` vuelve a la lista completa. */
  readonly search: (email: string | undefined) => void;
  readonly goToPage: (page: number) => void;
  readonly retry: () => void;
}

const FIRST_PAGE: AccountsRequest = { page: 1 };

function toAccountsState(
  outcome: RequestOutcome<AccountListResponse>,
  request: AccountsRequest,
): AccountsState {
  if (outcome.ok) {
    return { status: 'ready', result: outcome.value, email: request.email, paging: false };
  }
  return isForbidden(outcome.error) ? { status: 'forbidden' } : { status: 'error' };
}

/** Lista de cuentas (011 CA-1, CA-17): la primera página al abrir, búsqueda por el inicio del correo y páginas. */
export function useAccounts(load: LoadAccounts): Accounts {
  const [request, setRequest] = React.useState<AccountsRequest>(FIRST_PAGE);
  const [state, setState] = React.useState<AccountsState>({ status: 'loading' });
  useLatestRequest({ load, request, toState: toAccountsState, setState });
  const restart = (next: AccountsRequest, nextState: AccountsState): void => {
    setRequest(next);
    setState(nextState);
  };
  return {
    state,
    search: (email) =>
      restart(email === undefined ? { ...FIRST_PAGE } : { ...FIRST_PAGE, email }, {
        status: 'loading',
      }),
    goToPage: (page) => {
      if (state.status !== 'ready' || state.paging) return;
      restart({ ...request, page }, { ...state, paging: true });
    },
    retry: () => restart({ ...request }, { status: 'loading' }),
  };
}
