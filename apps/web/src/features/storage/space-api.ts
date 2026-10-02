import { spaceSummaryResponseSchema, type SpaceSummaryResponse } from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from './storage-http';

/** Resumen de espacio en la API (plan 007 §4). Sin ofertas de ampliación. */
export interface SpaceApi {
  /** `GET /storage/summary`: plan, usado, reservado, cuota, disponible, máximo por archivo y desglose (CA-1, CA-6). */
  spaceSummary(): Promise<SpaceSummaryResponse>;
}

export function createSpaceApi(http: StorageHttp): SpaceApi {
  return {
    spaceSummary: async () =>
      parseResponse(await http.get('/storage/summary'), spaceSummaryResponseSchema),
  };
}
