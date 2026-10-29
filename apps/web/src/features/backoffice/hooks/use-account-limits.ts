'use client';

import { IDENTITY_ERROR_CODES, type AccountLimits } from '@nimbo/contracts';
import * as React from 'react';

import {
  hasErrorCode,
  isForbidden,
  useLatestRequest,
  type RequestOutcome,
} from './use-latest-request';

/** `GET /backoffice/accounts/:id/limits`; debe ser estable entre renders. */
export type LoadAccountLimits = (id: string) => Promise<AccountLimits>;

/** Como `AccountState` (011): `notFound` es `404 IDENTITY_ACCOUNT_NOT_FOUND` y `forbidden` un 403 (011b CA-16). */
export type AccountLimitsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly limits: AccountLimits }
  | { readonly status: 'notFound' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error' };

export interface AccountLimitsLoad {
  readonly state: AccountLimitsState;
  readonly retry: () => void;
  /** Muestra los límites que devolvió un ajuste sin volver a pedirlos. */
  readonly replace: (limits: AccountLimits) => void;
}

interface LimitsRequest {
  readonly id: string;
}

function toLimitsState(outcome: RequestOutcome<AccountLimits>): AccountLimitsState {
  if (outcome.ok) return { status: 'ready', limits: outcome.value };
  if (hasErrorCode(outcome.error, IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND)) {
    return { status: 'notFound' };
  }
  return isForbidden(outcome.error) ? { status: 'forbidden' } : { status: 'error' };
}

/** Los límites y la vigencia de un cliente (011b HU-5, CA-1): el bloque «Límites y vigencia» de la ficha. */
export function useAccountLimits(load: LoadAccountLimits, id: string): AccountLimitsLoad {
  const [request, setRequest] = React.useState<LimitsRequest>({ id });
  const [state, setState] = React.useState<AccountLimitsState>({ status: 'loading' });
  const loadById = React.useCallback((next: LimitsRequest) => load(next.id), [load]);
  useLatestRequest({ load: loadById, request, toState: toLimitsState, setState });
  return {
    state,
    retry: () => {
      setRequest({ id });
      setState({ status: 'loading' });
    },
    replace: (limits) => setState({ status: 'ready', limits }),
  };
}
