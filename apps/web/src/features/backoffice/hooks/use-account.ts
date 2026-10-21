'use client';

import { IDENTITY_ERROR_CODES, type AccountListItem } from '@nimbo/contracts';
import * as React from 'react';

import {
  hasErrorCode,
  isForbidden,
  useLatestRequest,
  type RequestOutcome,
} from './use-latest-request';

/** `GET /backoffice/accounts/:id`; debe ser estable entre renders. */
export type LoadAccount = (id: string) => Promise<AccountListItem>;

/** `notFound`: `404 IDENTITY_ACCOUNT_NOT_FOUND` (también un id que no es UUID); `forbidden`: 403 (CA-14). */
export type AccountState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly account: AccountListItem }
  | { readonly status: 'notFound' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error' };

export interface Account {
  readonly state: AccountState;
  readonly retry: () => void;
  /** Muestra la cuenta que devolvió una acción (suspender, reactivar) sin volver a pedirla. */
  readonly replace: (account: AccountListItem) => void;
}

interface AccountRequest {
  readonly id: string;
}

function toAccountState(outcome: RequestOutcome<AccountListItem>): AccountState {
  if (outcome.ok) return { status: 'ready', account: outcome.value };
  if (hasErrorCode(outcome.error, IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND)) {
    return { status: 'notFound' };
  }
  return isForbidden(outcome.error) ? { status: 'forbidden' } : { status: 'error' };
}

/** Una cuenta por su id (011 CA-1): la ficha y la vista de sus metadatos (`desde-admin`). */
export function useAccount(load: LoadAccount, id: string): Account {
  const [request, setRequest] = React.useState<AccountRequest>({ id });
  const [state, setState] = React.useState<AccountState>({ status: 'loading' });
  const loadById = React.useCallback((next: AccountRequest) => load(next.id), [load]);
  useLatestRequest({ load: loadById, request, toState: toAccountState, setState });
  return {
    state,
    retry: () => {
      setRequest({ id });
      setState({ status: 'loading' });
    },
    replace: (account) => setState({ status: 'ready', account }),
  };
}
