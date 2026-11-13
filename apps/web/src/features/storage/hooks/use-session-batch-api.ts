'use client';

import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createBatchApi, type BatchApi } from '../batch-api';
import { createStorageHttp } from '../storage-http';

/** Cliente de los lotes (selección múltiple) con la sesión en memoria (002); estable entre renders. */
export function useSessionBatchApi(apiPublicUrl: string): BatchApi {
  const authFetch = useAuthFetch();
  return React.useMemo(
    () => createBatchApi(createStorageHttp(apiPublicUrl, authFetch)),
    [apiPublicUrl, authFetch],
  );
}
