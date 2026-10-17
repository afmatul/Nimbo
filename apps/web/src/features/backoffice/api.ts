import { clientFilesResponseSchema, type ClientFilesResponse } from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';
import { parseResponse } from '../storage/storage-http';

const CLIENT_FILES_PATH = '/backoffice/client-files';

/** Correo exacto de un cliente y la página de sus archivos (011 CA-13, DF-66). */
export interface ClientFilesRequest {
  readonly email: string;
  readonly page: number;
}

/** El backoffice en la API (011 plan §4); hoy, la parte de metadatos. */
export interface BackofficeApi {
  /** `GET /backoffice/client-files`: el cliente y una página de los metadatos de sus archivos. */
  listClientFiles(request: ClientFilesRequest): Promise<ClientFilesResponse>;
}

function clientFilesUrl(base: string, { email, page }: ClientFilesRequest): string {
  const params = new URLSearchParams({ email, page: String(page) });
  return `${base}${CLIENT_FILES_PATH}?${params.toString()}`;
}

/**
 * Habla con la API por `auth-fetch`: un error HTTP llega como `ApiClientError` y una respuesta fuera del contrato
 * (p. ej. con algo más que metadatos) se rechaza como falla del servidor (CA-13, RN-1).
 */
export function createBackofficeApi(apiPublicUrl: string, authFetch: AuthFetch): BackofficeApi {
  const base = apiPublicUrl.replace(/\/$/, '');
  return {
    listClientFiles: async (request) =>
      parseResponse(
        await authFetch(clientFilesUrl(base, request), { method: 'GET' }),
        clientFilesResponseSchema,
      ),
  };
}
