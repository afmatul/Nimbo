'use client';

import {
  formatBytes,
  type EmptyTrashResponse,
  type TrashItem,
  type TrashSummary,
} from '@nimbo/contracts';
import * as React from 'react';

import { showNotice } from '../../../components/ui/sonner';
import type { TrashApi } from '../trash-api';

/** Cada cuánto se vuelve a leer `GET /trash/summary` mientras se vacía (CA-18, plan R-1). */
export const EMPTY_POLL_INTERVAL_MS = 3_000;

export type TrashListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly items: readonly TrashItem[];
      readonly summary: TrashSummary;
      /** Momento de la lectura, para los días restantes. */
      readonly loadedAt: number;
    };

export type TrashReader = Pick<TrashApi, 'listTrash' | 'trashSummary'>;

const LOADING: TrashListing = { status: 'loading' };

interface KeyedListing {
  readonly attempt: number;
  readonly listing: TrashListing;
}

function withoutItems(listing: TrashListing, ids: ReadonlySet<string>): TrashListing {
  if (listing.status !== 'ready') return listing;
  return { ...listing, items: listing.items.filter((item) => !ids.has(item.id)) };
}

function withSummary(listing: TrashListing, summary: TrashSummary): TrashListing {
  return listing.status === 'ready' ? { ...listing, summary } : listing;
}

/**
 * Lista y resumen de la papelera (primera página, CA-12). Las acciones quitan filas en el momento y vuelven a leer el
 * resumen; «Vaciar» deja las filas en «Vaciando…» y relee el resumen hasta que la papelera queda vacía (CA-18).
 */
export function useTrash(
  api: TrashReader,
  now: () => number = Date.now,
): {
  readonly listing: TrashListing;
  readonly reload: () => void;
  readonly removeItems: (ids: ReadonlySet<string>) => void;
  readonly refreshSummary: () => void;
  readonly emptying: EmptyTrashResponse | null;
  readonly startEmptying: (response: EmptyTrashResponse) => void;
} {
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState<KeyedListing>({ attempt: -1, listing: LOADING });
  const [emptying, setEmptying] = React.useState<EmptyTrashResponse | null>(null);

  React.useEffect(() => {
    let current = true;
    const settle = (listing: TrashListing): void => {
      if (current) setState({ attempt, listing });
    };
    Promise.all([api.listTrash(), api.trashSummary()]).then(
      ([page, summary]) => settle({ status: 'ready', items: page.items, summary, loadedAt: now() }),
      () => settle({ status: 'error' }),
    );
    return () => {
      current = false;
    };
  }, [api, attempt, now]);

  const update = React.useCallback(
    (change: (listing: TrashListing) => TrashListing) =>
      setState((previous) => ({ ...previous, listing: change(previous.listing) })),
    [],
  );

  const refreshSummary = React.useCallback(() => {
    api.trashSummary().then(
      (summary) => update((listing) => withSummary(listing, summary)),
      () => undefined,
    );
  }, [api, update]);

  React.useEffect(() => {
    if (emptying === null) return undefined;
    let current = true;
    const finish = (summary: TrashSummary): void => {
      current = false;
      update(() => ({ status: 'ready', items: [], summary, loadedAt: now() }));
      showNotice(
        `Vaciaste la papelera. Liberaste ${formatBytes(emptying.pendingBytes)} de espacio.`,
      );
      setEmptying(null);
    };
    // Mientras se vacía, relee el resumen; un fallo de lectura solo espera a la siguiente vuelta.
    const timer = setInterval(() => {
      api.trashSummary().then(
        (summary) => {
          if (current && summary.itemCount === 0) finish(summary);
        },
        () => undefined,
      );
    }, EMPTY_POLL_INTERVAL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [api, emptying, now, update]);

  return {
    listing: state.attempt === attempt ? state.listing : LOADING,
    reload: React.useCallback(() => setAttempt((previous) => previous + 1), []),
    removeItems: React.useCallback(
      (ids: ReadonlySet<string>) => update((listing) => withoutItems(listing, ids)),
      [update],
    ),
    refreshSummary,
    emptying,
    startEmptying: setEmptying,
  };
}
