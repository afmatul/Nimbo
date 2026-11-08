'use client';

import * as React from 'react';

import { useViewCache } from '../../../lib/view-cache';
import type { TrashApi } from '../trash-api';

const CACHE_KEY = 'trash-count';

/**
 * Contador de la Papelera en la barra lateral (`GET /trash/summary`, spec 006 §6). Si la lectura falla no se muestra:
 * no es información vital y la papelera tiene su propia pantalla.
 */
export function useTrashCount(api: Pick<TrashApi, 'trashSummary'>): {
  readonly count: number | undefined;
  readonly refresh: () => void;
} {
  const cache = useViewCache();
  const [count, setCount] = React.useState<number | undefined>(() => cache.get(CACHE_KEY));
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    api.trashSummary().then(
      (summary) => {
        cache.set(CACHE_KEY, summary.itemCount);
        if (current) setCount(summary.itemCount);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [api, attempt, cache]);

  return { count, refresh: React.useCallback(() => setAttempt((previous) => previous + 1), []) };
}
