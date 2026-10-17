import { openEditSessionResponseSchema, type OpenEditSessionResponse } from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from '../storage/storage-http';

/** Apertura del editor en la API (plan 016 §4). Un error HTTP llega como `StorageRequestError` con su código. */
export interface EditingApi {
  /**
   * `POST /files/:fileId/edit-session`: responde siempre con un modo (edición o solo lectura con motivo). Con el id de
   * la conexión en vivo, el servidor la admite en la sala del documento (CA-6); el cliente nunca envía su nombre (RN-12).
   */
  openSession(fileId: string, connectionId: string | null): Promise<OpenEditSessionResponse>;
}

export function createEditingApi(http: StorageHttp): EditingApi {
  return {
    openSession: async (fileId, connectionId) =>
      parseResponse(
        await http.post(
          `/files/${encodeURIComponent(fileId)}/edit-session`,
          connectionId === null ? {} : { connectionId },
        ),
        openEditSessionResponseSchema,
      ),
  };
}
