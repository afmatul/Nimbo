import {
  batchDownloadResponseSchema,
  batchResultSchema,
  type BatchDownloadResponse,
  type BatchItem,
  type BatchResult,
  type BatchShareRequest,
} from '@nimbo/contracts';

import { shareNodesBatch } from '../sharing';

import { parseResponse, type StorageHttp } from './storage-http';

/** Operaciones por lote del explorador (selección múltiple): cada elemento sale bien o falla con su código. */
export interface BatchApi {
  /** `targetFolderId: null` mueve a la raíz. */
  move(items: readonly BatchItem[], targetFolderId: string | null): Promise<BatchResult>;
  /** Manda a la papelera. */
  trash(items: readonly BatchItem[]): Promise<BatchResult>;
  download(items: readonly BatchItem[]): Promise<BatchDownloadResponse>;
  share(input: BatchShareRequest): Promise<BatchResult>;
}

export function createBatchApi(http: StorageHttp): BatchApi {
  return {
    move: async (items, targetFolderId) =>
      parseResponse(
        await http.post('/nodes/batch/move', { items, targetFolderId }),
        batchResultSchema,
      ),
    trash: async (items) =>
      parseResponse(await http.post('/nodes/batch/delete', { items }), batchResultSchema),
    download: async (items) =>
      parseResponse(
        await http.post('/nodes/batch/download', { items }),
        batchDownloadResponseSchema,
      ),
    share: (input) => shareNodesBatch(http, input),
  };
}
