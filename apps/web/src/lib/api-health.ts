import { healthReadyResponseSchema, type HealthReadyResponse } from '@nimbo/contracts';

const READY_PATH = '/api/v1/health/ready';
const TIMEOUT_MS = 3000;
const VERSION_HEADER = 'x-nimbo-version';

export type ApiAvailability = 'disponible' | 'no disponible';

export interface ApiHealth {
  readonly availability: ApiAvailability;
  /** Valor de `x-nimbo-version` (CA-31), si la API respondió. */
  readonly version?: string;
}

function toAvailability(body: HealthReadyResponse): ApiAvailability {
  return body.status === 'ok' ? 'disponible' : 'no disponible';
}

/**
 * Consulta `health/ready` de la API en tiempo de petición (`cache: 'no-store'`). Cualquier fallo de red,
 * tiempo de espera o cuerpo inesperado se traduce a «no disponible» sin exponer detalles (CA-33).
 */
export async function getApiHealth(apiBaseUrl: string): Promise<ApiHealth> {
  try {
    const response = await fetch(`${apiBaseUrl}${READY_PATH}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const version = response.headers.get(VERSION_HEADER);
    const availability = response.ok
      ? toAvailability(healthReadyResponseSchema.parse(await response.json()))
      : 'no disponible';
    return version === null ? { availability } : { availability, version };
  } catch {
    return { availability: 'no disponible' };
  }
}
