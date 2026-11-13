import { batchResultSchema, type BatchResult, type BatchShareRequest } from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from '../storage/storage-http';

/** `POST /shares/batch`: comparte varios nodos con la misma persona y nivel; cada uno sale bien o falla con su código. */
export async function shareNodesBatch(
  http: StorageHttp,
  input: BatchShareRequest,
): Promise<BatchResult> {
  return parseResponse(await http.post('/shares/batch', input), batchResultSchema);
}
