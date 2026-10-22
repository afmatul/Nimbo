import type { IndexingReason, IndexingState } from '../../domain/file-indexing';

/** Cambio de estado de indexación de un archivo, para su propietaria (plan 019 §4). Sin nombre, texto ni versión. */
export interface IndexStatusChange {
  readonly ownerId: string;
  readonly fileId: string;
  readonly state: IndexingState;
  readonly reason: IndexingReason | null;
}

/**
 * Aviso en vivo `indexing.status-changed` (CA-14, ADR-0030; regla (e) de Art. V.2): en el `api` va directo al canal de
 * 015 (`RealtimeIndexStatusNotifier`) y en el `worker`, por la cola `index-status` que el `api` retransmite (T-06).
 * De mejor esfuerzo: un aviso perdido no cambia el estado guardado.
 */
export interface IIndexStatusNotifier {
  notify(change: IndexStatusChange): Promise<void>;
}

export const I_INDEX_STATUS_NOTIFIER = Symbol('IIndexStatusNotifier');
