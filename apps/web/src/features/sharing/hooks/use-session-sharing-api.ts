'use client';

import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createStorageHttp } from '../../storage/storage-http';
import { createSharingApi, type SharingApi } from '../sharing-api';

/** Cliente de compartición con `auth-fetch` y el token en memoria de la sesión (002); estable entre renders. */
export function useSessionSharingApi(apiPublicUrl: string): SharingApi {
  const authFetch = useAuthFetch();
  return React.useMemo(
    () => createSharingApi(createStorageHttp(apiPublicUrl, authFetch)),
    [apiPublicUrl, authFetch],
  );
}
