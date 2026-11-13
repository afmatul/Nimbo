'use client';

import type * as React from 'react';

import { useSessionSharingApi } from '../../sharing';
import { useSessionBatchApi } from '../hooks/use-session-batch-api';

import { MyFiles } from './my-files';

/**
 * Mis archivos con los clientes de la sesión: compartición (012b) y lotes de la selección múltiple. Las páginas son de
 * servidor y solo pasan la URL.
 */
export function SessionMyFiles({
  apiPublicUrl,
  folderId,
}: {
  readonly apiPublicUrl: string;
  readonly folderId: string | null;
}): React.JSX.Element {
  return (
    <MyFiles
      folderId={folderId}
      sharingApi={useSessionSharingApi(apiPublicUrl)}
      batchApi={useSessionBatchApi(apiPublicUrl)}
    />
  );
}
