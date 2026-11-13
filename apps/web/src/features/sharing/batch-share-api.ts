import {
  batchResultSchema,
  type BatchItem,
  type BatchResult,
  type ShareLevel,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from '../storage/storage-http';

export interface BatchShareInput {
  readonly items: readonly BatchItem[];
  readonly email: string;
  readonly level: ShareLevel;
}

/** `POST /shares/batch`: comparte varios nodos con la misma persona y nivel; cada uno sale bien o falla con su código. */
export async function shareNodesBatch(
  http: StorageHttp,
  input: BatchShareInput,
): Promise<BatchResult> {
  return parseResponse(await http.post('/shares/batch', input), batchResultSchema);
}
