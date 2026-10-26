import type { IndexingStatusResponse } from '@nimbo/contracts';

import type { IndexingApi } from './indexing-api';

export const INDEXED_FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
export const OTHER_FILE_ID = '9c0d1e2f-2f0c-4c5d-8e6f-3a4b4c5d8e6f';
export const INDEXED_AT = '2026-10-08T16:44:00.000Z';

/** Respuesta de `GET /files/:fileId/indexing` (plan 019 §4); por omisión, `indexado`. */
export function indexingStatus(
  overrides: Partial<IndexingStatusResponse> = {},
): IndexingStatusResponse {
  return { state: 'indexado', reason: null, updatedAt: INDEXED_AT, canRetry: false, ...overrides };
}

export const INDEXING = indexingStatus({ state: 'indexando', updatedAt: null });
export const FAILED = indexingStatus({
  state: 'fallido',
  reason: 'proveedor_no_disponible',
  canRetry: true,
});
export const NOT_INDEXED_TYPE = indexingStatus({ state: null, updatedAt: null });

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** Doble del cliente de indexación: por omisión, la lectura no responde. */
export function fakeIndexingApi(overrides: Partial<IndexingApi> = {}): jest.Mocked<IndexingApi> {
  return {
    status: jest.fn(() => never()),
    retry: jest.fn(() => never()),
    ...overrides,
  } as jest.Mocked<IndexingApi>;
}
