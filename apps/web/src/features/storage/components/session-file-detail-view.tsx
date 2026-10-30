'use client';

import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createIndexingApi } from '../../intelligence/indexing-api';
import { createStorageHttp } from '../storage-http';

import { FileDetailView } from './file-detail-view';

/** Arma el cliente de indexación (019) con `auth-fetch` y el token en memoria de la sesión (002), como `editing`. */
export function SessionFileDetailView({
  apiPublicUrl,
  fileId,
  citedLocation,
}: {
  readonly apiPublicUrl: string;
  readonly fileId: string;
  /** Etiqueta de la cita (`?ubicacion=`, 020b CA-11). */
  readonly citedLocation: string | undefined;
}): React.JSX.Element {
  const authFetch = useAuthFetch();
  const indexingApi = React.useMemo(
    () => createIndexingApi(createStorageHttp(apiPublicUrl, authFetch)),
    [apiPublicUrl, authFetch],
  );
  return <FileDetailView fileId={fileId} indexingApi={indexingApi} citedLocation={citedLocation} />;
}
