import { agentStatusSchema, type AgentStatusResponse } from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';

const STATUS_PATH = '/agent/status';

/** URL de una ruta del agente sobre `API_PUBLIC_URL`, con o sin barra final. */
export const agentEndpoint = (apiPublicUrl: string, path: string): string =>
  `${apiPublicUrl.replace(/\/$/, '')}${path}`;

/**
 * `GET /agent/status` (plan 020b §4, D-9): contador, renovación, si hay archivos indexados y el máximo de la pregunta.
 * Un error HTTP llega como `ApiClientError` con su `code`.
 */
export async function getStatus(
  apiPublicUrl: string,
  authFetch: AuthFetch,
): Promise<AgentStatusResponse> {
  return agentStatusSchema.parse(await authFetch(agentEndpoint(apiPublicUrl, STATUS_PATH)));
}
