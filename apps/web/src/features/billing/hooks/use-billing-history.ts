'use client';

import type { BillingHistoryResponse } from '@nimbo/contracts';
import * as React from 'react';

export type BillingHistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly history: BillingHistoryResponse };

const LOADING: BillingHistoryState = { status: 'loading' };

/**
 * Una lectura del historial por intento (spec 009 CA-7); la respuesta de un intento anterior se descarta y «Reintentar»
 * vuelve a «cargando».
 */
export function useBillingHistory(load: () => Promise<BillingHistoryResponse>): {
  readonly state: BillingHistoryState;
  readonly retry: () => void;
} {
  const [state, setState] = React.useState<BillingHistoryState>(LOADING);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    load().then(
      (history) => current && setState({ status: 'ready', history }),
      () => current && setState({ status: 'error' }),
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);

  const retry = React.useCallback(() => {
    setState(LOADING);
    setAttempt((previous) => previous + 1);
  }, []);

  return { state, retry };
}
