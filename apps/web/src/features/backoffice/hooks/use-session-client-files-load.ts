'use client';

import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createBackofficeApi } from '../api';

import type { LoadClientFiles } from './use-client-files';

/** `GET /backoffice/client-files` con `useAuthFetch` (002): su identidad no cambia al renovar el token. */
export function useSessionClientFilesLoad(apiPublicUrl: string): LoadClientFiles {
  const authFetch = useAuthFetch();
  return React.useMemo(
    () => createBackofficeApi(apiPublicUrl, authFetch).listClientFiles,
    [apiPublicUrl, authFetch],
  );
}
