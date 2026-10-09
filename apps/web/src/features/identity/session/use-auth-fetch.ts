'use client';

import { useEffect, useMemo, useState } from 'react';

import { createAuthFetch, type AuthFetch } from './auth-fetch';
import { useSession } from './session-provider';

interface TokenHolder {
  readonly get: () => string | null;
  readonly set: (token: string | null) => void;
}

/** Último token de acceso, leído en el momento de cada petición (no durante el render). */
function createTokenHolder(initial: string | null): TokenHolder {
  let current = initial;
  return {
    get: () => current,
    set: (token) => {
      current = token;
    },
  };
}

/**
 * `auth-fetch` con el token en memoria de la sesión (002). El token se lee en cada petición: una renovación no cambia
 * la identidad de la función, así no recrea a quien depende de ella ni repite sus cargas.
 */
export function useAuthFetch(): AuthFetch {
  const { accessToken, renew } = useSession();
  const [token] = useState(() => createTokenHolder(accessToken));
  useEffect(() => token.set(accessToken), [token, accessToken]);
  return useMemo(() => createAuthFetch({ getAccessToken: token.get, renew }), [token, renew]);
}
