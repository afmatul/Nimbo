import { SHARED_ERROR_CODES } from '@nimbo/contracts';

import { requestJson } from '../../../lib/api-client';
import { ApiClientError } from '../../../lib/api-error';

export interface AuthFetchDeps {
  /** Token de acceso en memoria (`SessionProvider`); `null` si todavía no hay. */
  readonly getAccessToken: () => string | null;
  /** Renueva la sesión; `null` si ya no hay sesión (el proveedor la cierra). */
  readonly renew: () => Promise<string | null>;
}

export type AuthFetch = (url: string, init?: RequestInit) => Promise<unknown>;

function withBearer(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token !== null) headers.set('authorization', `Bearer ${token}`);
  return { ...init, headers };
}

function isUnauthenticated(caught: unknown): boolean {
  return caught instanceof ApiClientError && caught.code === SHARED_ERROR_CODES.UNAUTHENTICATED;
}

/**
 * `requestJson` con `Authorization: Bearer`. Solo un `401 SHARED_UNAUTHENTICATED` renueva y repite una vez (003 D-6);
 * un `401 IDENTITY_*` se propaga tal cual (plan 002 §5). Si la renovación falla se propaga el `401` original.
 */
export function createAuthFetch(deps: AuthFetchDeps): AuthFetch {
  return async (url, init = {}) => {
    try {
      return await requestJson(url, withBearer(init, deps.getAccessToken()));
    } catch (caught) {
      if (!isUnauthenticated(caught)) throw caught;
      const token = await deps.renew();
      if (token === null) throw caught;
      return requestJson(url, withBearer(init, token));
    }
  };
}
