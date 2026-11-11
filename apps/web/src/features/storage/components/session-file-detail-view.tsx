'use client';

import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createIndexingApi } from '../../intelligence/indexing-api';
import { createOptimizerApi } from '../../optimizer/optimizer-api';
import { createSharingApi } from '../../sharing';
import { createStorageHttp } from '../storage-http';

import { FileDetailView } from './file-detail-view';

/** Clientes de indexación, optimización y compartición con `auth-fetch` y el token en memoria de la sesión. */
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
  const http = React.useMemo(
    () => createStorageHttp(apiPublicUrl, authFetch),
    [apiPublicUrl, authFetch],
  );
  const indexingApi = React.useMemo(() => createIndexingApi(http), [http]);
  const optimizerApi = React.useMemo(() => createOptimizerApi(http), [http]);
  const sharingApi = React.useMemo(() => createSharingApi(http), [http]);
  return (
    <FileDetailView
      fileId={fileId}
      indexingApi={indexingApi}
      optimizerApi={optimizerApi}
      sharingApi={sharingApi}
      citedLocation={citedLocation}
    />
  );
}
