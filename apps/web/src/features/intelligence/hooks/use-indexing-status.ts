'use client';

import {
  INDEXING_EVENTS,
  indexingStatusChangedSchema,
  INTELLIGENCE_ERROR_CODES,
  type IndexingState,
  type IndexingStatusResponse,
} from '@nimbo/contracts';
import * as React from 'react';

import { useRealtime } from '../../realtime/use-realtime';
import { isStorageNotFound, StorageRequestError } from '../../storage/storage-request-error';
import type { IndexingApi } from '../indexing-api';

/** «Reintentar» (CA-13): en curso, fallido (no llegó al servidor) y la acción, que dice si lo logró. */
export interface RetryControl {
  readonly pending: boolean;
  readonly failed: boolean;
  readonly run: () => Promise<boolean>;
}

/** Estado leído (`null` mientras no hay, o si el archivo no es visible) y su «Reintentar». */
export interface IndexingStatusView {
  readonly status: IndexingStatusResponse | null;
  readonly retry: RetryControl;
}

interface StatusStore {
  readonly status: IndexingStatusResponse | null;
  readonly latest: React.RefObject<IndexingStatusResponse | null>;
  /** Lee el estado; cada lectura o cambio local nuevo descarta la respuesta de las anteriores. */
  readonly load: () => Promise<void>;
  /** Fija un estado conocido sin esperar a la API (aviso en vivo, reintento aceptado). */
  readonly overwrite: (next: IndexingStatusResponse) => void;
}

const FORBIDDEN_STATUS = 403;

/** Un estado sin fecha ni reintento: el aviso en vivo y el `202` no traen ni una ni otro (plan §4). */
function knownState(
  state: IndexingState,
  reason: IndexingStatusResponse['reason'],
): IndexingStatusResponse {
  return { state, reason, updatedAt: null, canRetry: false };
}

/** `404` (ajeno, papelera, inexistente) o `403` (rol interno): no se muestra estado (CA-18, CA-20). */
function isHidden(error: unknown): boolean {
  return (
    isStorageNotFound(error) ||
    (error instanceof StorageRequestError && error.status === FORBIDDEN_STATUS)
  );
}

/** El archivo ya no está `fallido` o ya no existe: se relee el estado en vez de avisar un error. */
function isStale(error: unknown): boolean {
  return (
    isStorageNotFound(error) ||
    (error instanceof StorageRequestError &&
      error.code === INTELLIGENCE_ERROR_CODES.INTELLIGENCE_INDEXING_NOT_RETRYABLE)
  );
}

function useStatusStore(api: IndexingApi, fileId: string): StatusStore {
  const [status, setStatus] = React.useState<IndexingStatusResponse | null>(null);
  const latest = React.useRef<IndexingStatusResponse | null>(null);
  const ticket = React.useRef(0);
  const commit = React.useCallback((next: IndexingStatusResponse | null) => {
    latest.current = next;
    setStatus(next);
  }, []);
  const overwrite = React.useCallback(
    (next: IndexingStatusResponse) => {
      ticket.current += 1;
      commit(next);
    },
    [commit],
  );
  const load = React.useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const next = await api.status(fileId);
      if (mine === ticket.current) commit(next);
    } catch (error) {
      if (mine === ticket.current && isHidden(error)) commit(null);
    }
  }, [api, fileId, commit]);
  return { status, latest, load, overwrite };
}

/**
 * `indexing.status-changed` de este archivo (CA-14): cambia el estado al instante y lo relee para su fecha y su
 * `canRetry`. Avisa solo la llegada a `indexado`. Un aviso de otro archivo o fuera del contrato se ignora.
 */
function useLiveStatus(fileId: string, store: StatusStore, onIndexed: () => void): void {
  const { on } = useRealtime();
  const { latest, load, overwrite } = store;
  const indexedRef = React.useRef(onIndexed);
  React.useEffect(() => {
    indexedRef.current = onIndexed;
  }, [onIndexed]);
  React.useEffect(
    () =>
      on(INDEXING_EVENTS.STATUS_CHANGED, (payload) => {
        const parsed = indexingStatusChangedSchema.safeParse(payload);
        if (!parsed.success || parsed.data.fileId !== fileId) return;
        const wasIndexed = latest.current?.state === 'indexado';
        overwrite(knownState(parsed.data.state, parsed.data.reason));
        if (parsed.data.state === 'indexado' && !wasIndexed) indexedRef.current();
        void load();
      }),
    [on, fileId, latest, load, overwrite],
  );
}

/** Tras un corte, el canal vuelve con otro id: se relee por si se perdió un aviso mientras tanto. */
function useRevalidateOnReconnect(load: () => Promise<void>): void {
  const { connectionId } = useRealtime();
  const previous = React.useRef(connectionId);
  React.useEffect(() => {
    if (connectionId !== null && connectionId !== previous.current) void load();
    previous.current = connectionId;
  }, [connectionId, load]);
}

function useRetry(api: IndexingApi, fileId: string, store: StatusStore): RetryControl {
  const [phase, setPhase] = React.useState<'idle' | 'pending' | 'failed'>('idle');
  const { load, overwrite } = store;
  const run = React.useCallback(async (): Promise<boolean> => {
    setPhase('pending');
    try {
      const { state } = await api.retry(fileId);
      overwrite(knownState(state, null));
      setPhase('idle');
      return true;
    } catch (error) {
      setPhase(isStale(error) ? 'idle' : 'failed');
      if (isStale(error)) void load();
      return false;
    }
  }, [api, fileId, load, overwrite]);
  return { pending: phase === 'pending', failed: phase === 'failed', run };
}

/**
 * Estado de indexación de un archivo en su ficha (019 CA-13, CA-14): lo lee al abrir, lo actualiza en vivo por el canal
 * de 015 y lo revalida al reconectar. `onIndexed` corre cuando termina de indexarse mientras se mira.
 */
export function useIndexingStatus(
  api: IndexingApi,
  fileId: string,
  onIndexed: () => void,
): IndexingStatusView {
  const store = useStatusStore(api, fileId);
  const { load } = store;
  React.useEffect(() => {
    void load();
  }, [load]);
  useLiveStatus(fileId, store, onIndexed);
  useRevalidateOnReconnect(load);
  return { status: store.status, retry: useRetry(api, fileId, store) };
}
