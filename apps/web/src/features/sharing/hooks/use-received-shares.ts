'use client';

import type { ReceivedShare } from '@nimbo/contracts';
import * as React from 'react';

import { useViewCache, type ViewCache } from '../../../lib/view-cache';
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
  /** «Salir» (012 CA-23): rechaza con el error de la API; si sale bien, el elemento deja la lista sin releerla. */
  readonly leave: (shareId: string) => Promise<void>;
}

type SetListing = React.Dispatch<React.SetStateAction<ReceivedListing>>;

const CACHE_KEY = 'received-shares';
const LOADING: ReceivedListing = { status: 'loading' };

/** Pide la lista y la deja en `setListing`; la función devuelta descarta la respuesta si llega tarde. */
function requestReceived(
  api: SharingApi,
  now: () => number,
  setListing: SetListing,
  cache: ViewCache,
): () => void {
  let current = true;
  api.listReceived().then(
    ({ entries }) => {
      const ready: ReceivedListing = { status: 'ready', entries, loadedAt: now() };
      cache.set(CACHE_KEY, ready);
      if (current) setListing(ready);
    },
    () => {
      if (current) setListing({ status: 'error' });
    },
  );
  return () => {
    current = false;
  };
}

/** La lista sin el elemento del que se salió; fuera de «lista» no hay nada que quitar. */
function withoutShare(listing: ReceivedListing, shareId: string): ReceivedListing {
  if (listing.status !== 'ready') return listing;
  return { ...listing, entries: listing.entries.filter((entry) => entry.shareId !== shareId) };
}

/**
 * `GET /shares/received` (spec 012b CA-8, CA-11). `reload` conserva la lista visible hasta la respuesta; desde el error
 * vuelve a «cargando». Una respuesta de un intento anterior se descarta.
 */
export function useReceivedShares(
  api: SharingApi,
  now: () => number = Date.now,
): ReceivedSharesState {
  const cache = useViewCache();
  const [listing, setListing] = React.useState<ReceivedListing>(
    () => cache.get<ReceivedListing>(CACHE_KEY) ?? LOADING,
  );
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(
    () => requestReceived(api, now, setListing, cache),
    [api, attempt, now, cache],
  );

  const reload = React.useCallback(() => {
    setListing((previous) => (previous.status === 'error' ? LOADING : previous));
    setAttempt((previous) => previous + 1);
  }, []);

  const leave = React.useCallback(
    async (shareId: string) => {
      await api.leave(shareId);
      setListing((previous) => {
        const next = withoutShare(previous, shareId);
        cache.set(CACHE_KEY, next);
        return next;
      });
    },
    [api, cache],
  );

  return { listing, reload, leave };
}
