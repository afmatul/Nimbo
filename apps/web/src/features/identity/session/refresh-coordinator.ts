import { IDENTITY_ERROR_CODES, type SessionResponse } from '@nimbo/contracts';

import { ApiClientError } from '../../../lib/api-error';

/** Candado entre pestañas: una sola renueva a la vez y la siguiente manda la cookie que dejó la anterior (RN-4). */
export const REFRESH_LOCK_NAME = 'nimbo-refresh';

/** Lo que el coordinador usa de `navigator.locks`; así se simula en las pruebas. */
export interface LockRequester {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface RefreshCoordinatorDeps {
  readonly refresh: () => Promise<SessionResponse>;
  /** Se llama ante `IDENTITY_SESSION_EXPIRED` o `IDENTITY_SESSION_REVOKED`: limpiar la memoria e ir a iniciar sesión. */
  readonly onSessionEnded: () => void;
  /** `navigator.locks`; sin él (DT-16) basta el vuelo único de la pestaña. */
  readonly locks?: LockRequester | undefined;
}

export interface RefreshCoordinator {
  run(): Promise<SessionResponse>;
}

const ENDING_CODES: ReadonlySet<string> = new Set([
  IDENTITY_ERROR_CODES.SESSION_EXPIRED,
  IDENTITY_ERROR_CODES.SESSION_REVOKED,
]);

function hasCode(caught: unknown, code: string): boolean {
  return caught instanceof ApiClientError && caught.code === code;
}

/** `IDENTITY_REFRESH_INVALID` (p. ej., dentro de la gracia de rotación) merece un solo reintento (CA-9). */
async function refreshWithOneRetry(
  refresh: () => Promise<SessionResponse>,
): Promise<SessionResponse> {
  try {
    return await refresh();
  } catch (caught) {
    if (!hasCode(caught, IDENTITY_ERROR_CODES.REFRESH_INVALID)) throw caught;
    return refresh();
  }
}

/**
 * Renovación en un solo vuelo por pestaña y serializada entre pestañas (plan 002 §6.9, DT-16). Una sesión vencida o
 * revocada avisa con `onSessionEnded` (CA-8); los demás fallos se propagan a quien llamó.
 */
export function createRefreshCoordinator(deps: RefreshCoordinatorDeps): RefreshCoordinator {
  let inFlight: Promise<SessionResponse> | null = null;

  const renew = async (): Promise<SessionResponse> => {
    const attempt = (): Promise<SessionResponse> => refreshWithOneRetry(deps.refresh);
    try {
      return await (deps.locks === undefined
        ? attempt()
        : deps.locks.request(REFRESH_LOCK_NAME, attempt));
    } catch (caught) {
      if (caught instanceof ApiClientError && ENDING_CODES.has(caught.code)) deps.onSessionEnded();
      throw caught;
    }
  };

  return {
    run(): Promise<SessionResponse> {
      inFlight ??= renew().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
