import {
  listAuditEventsResponseSchema,
  type ListAuditEventsQuery,
  type ListAuditEventsResponse,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';
import { parseResponse } from '../storage/storage-http';

const MY_EVENTS_PATH = '/audit/my-events';

/** Bitácora de auditoría en la API (plan 004 §4): solo la lectura de la propia cuenta. */
export interface AuditApi {
  /** `GET /audit/my-events`: 20 eventos del más reciente al más antiguo; `nextCursor` es `null` al final (CA-9). */
  listMyEvents(query: ListAuditEventsQuery): Promise<ListAuditEventsResponse>;
}

function queryString(query: ListAuditEventsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * Habla con la API por `auth-fetch`: un error HTTP llega como `ApiClientError` con su `correlationId` (lo muestra el
 * estado de error) y una respuesta fuera del contrato se rechaza como falla del servidor (CA-14).
 */
export function createAuditApi(apiPublicUrl: string, authFetch: AuthFetch): AuditApi {
  const base = apiPublicUrl.replace(/\/$/, '');
  return {
    listMyEvents: async (query) =>
      parseResponse(
        await authFetch(`${base}${MY_EVENTS_PATH}${queryString(query)}`, { method: 'GET' }),
        listAuditEventsResponseSchema,
      ),
  };
}
