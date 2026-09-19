import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationStore {
  readonly correlationId: string;
  readonly jobId?: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

/** Cabecera aceptada: 1–128 caracteres ASCII imprimibles sin espacios (plan 000 §5). */
const CORRELATION_ID_PATTERN = /^[\x21-\x7E]{1,128}$/;

export const isValidCorrelationId = (value: string): boolean => CORRELATION_ID_PATTERN.test(value);

/**
 * Contexto de correlación por petición o trabajo (CA-13, CA-14), sobre `AsyncLocalStorage`.
 * El `mixin` del logger lo lee para estampar `correlationId`/`jobId` en cada línea.
 */
export const CorrelationContext = Object.freeze({
  run<T>(store: CorrelationStore, callback: () => T): T {
    return storage.run(store, callback);
  },
  get(): CorrelationStore | undefined {
    return storage.getStore();
  },
});
