import {
  indexingRetryResponseSchema,
  indexingStatusResponseSchema,
  type IndexingRetryResponse,
  type IndexingStatusResponse,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from '../storage/storage-http';

/** Estado de indexación de un archivo en la API (plan 019 §4). Un error HTTP llega como `StorageRequestError`. */
export interface IndexingApi {
  /** `GET /files/:fileId/indexing`: `404` para ajeno, papelera o inexistente (CA-18). */
  status(fileId: string): Promise<IndexingStatusResponse>;
  /** `POST /files/:fileId/indexing/retry` → `202 {state:'pendiente'}`; `409` si ya no está `fallido` (CA-13). */
  retry(fileId: string): Promise<IndexingRetryResponse>;
}

export function createIndexingApi(http: StorageHttp): IndexingApi {
  const indexingPath = (fileId: string): string => `/files/${encodeURIComponent(fileId)}/indexing`;
  return {
    status: async (fileId) =>
      parseResponse(await http.get(indexingPath(fileId)), indexingStatusResponseSchema),
    retry: async (fileId) =>
      parseResponse(await http.post(`${indexingPath(fileId)}/retry`), indexingRetryResponseSchema),
  };
}
