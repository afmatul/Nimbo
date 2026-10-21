'use client';

import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createBackofficeApi, type BackofficeApi } from '../api';

/** El backoffice con `useAuthFetch` (002): su identidad (y la de cada método) no cambia al renovar el token. */
export function useSessionBackofficeApi(apiPublicUrl: string): BackofficeApi {
  const authFetch = useAuthFetch();
  return React.useMemo(
    () => createBackofficeApi(apiPublicUrl, authFetch),
    [apiPublicUrl, authFetch],
  );
}
