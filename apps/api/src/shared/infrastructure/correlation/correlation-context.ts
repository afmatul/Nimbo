import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationStore {
  readonly correlationId: string;
  readonly jobId?: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Contexto de correlación por petición o trabajo (CA-13, CA-14), sobre `AsyncLocalStorage`.
 * El `mixin` del logger lo lee para estampar `correlationId`/`jobId` en cada línea.
 * T-14 agrega `isValidCorrelationId()` y `CorrelationIdMiddleware`.
 */
export const CorrelationContext = Object.freeze({
  run<T>(store: CorrelationStore, callback: () => T): T {
    return storage.run(store, callback);
  },
  get(): CorrelationStore | undefined {
    return storage.getStore();
  },
});
