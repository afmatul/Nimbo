'use client';

import type { BillingHistoryResponse, SubscriptionView } from '@nimbo/contracts';
import * as React from 'react';

export type BillingHistoryState<T extends BillingHistoryResponse = BillingHistoryResponse> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly history: T };

const LOADING = { status: 'loading' } as const;

/**
 * Una lectura del historial por intento (spec 009 CA-7); la respuesta de un intento anterior se descarta y «Reintentar»
 * vuelve a «cargando».
 */
export function useBillingHistory<T extends BillingHistoryResponse>(
  load: () => Promise<T>,
): {
  readonly state: BillingHistoryState<T>;
  readonly retry: () => void;
  /** 010 CA-6, CA-19: la vista que respondió un ajuste reemplaza la de la página sin recargar. */
  readonly replaceSubscription: (subscription: SubscriptionView) => void;
} {
  const [state, setState] = React.useState<BillingHistoryState<T>>(LOADING);
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

  const replaceSubscription = React.useCallback((subscription: SubscriptionView) => {
    setState((previous) =>
      previous.status === 'ready'
        ? { status: 'ready', history: { ...previous.history, subscription } }
        : previous,
    );
  }, []);

  return { state, retry, replaceSubscription };
}
