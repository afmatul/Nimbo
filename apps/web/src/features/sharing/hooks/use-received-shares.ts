'use client';

import type { ReceivedShare } from '@nimbo/contracts';
import * as React from 'react';

import type { SharingApi } from '../sharing-api';

/** «Compartidos conmigo»: cargando, error de carga o la lista (más recientes primero, 012 CA-22). */
export type ReceivedListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly entries: readonly ReceivedShare[];
      /** Momento de la lectura: referencia de «hoy» y «ayer». */
      readonly loadedAt: number;
    };

export interface ReceivedSharesState {
  readonly listing: ReceivedListing;
  readonly reload: () => void;
}

const LOADING: ReceivedListing = { status: 'loading' };

/**
 * `GET /shares/received` (spec 012b CA-8, CA-11). `reload` conserva la lista visible hasta la respuesta; desde el error
 * vuelve a «cargando». Una respuesta de un intento anterior se descarta.
 */
export function useReceivedShares(
  api: SharingApi,
  now: () => number = Date.now,
): ReceivedSharesState {
  const [listing, setListing] = React.useState<ReceivedListing>(LOADING);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    api.listReceived().then(
      ({ entries }) => {
        if (current) setListing({ status: 'ready', entries, loadedAt: now() });
      },
      () => {
        if (current) setListing({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [api, attempt, now]);

  const reload = React.useCallback(() => {
    setListing((previous) => (previous.status === 'error' ? LOADING : previous));
    setAttempt((previous) => previous + 1);
  }, []);

  return { listing, reload };
}
