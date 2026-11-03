'use client';

import type * as React from 'react';

import { useSessionSharingApi } from '../../sharing';

import { MyFiles } from './my-files';

/** Mis archivos con el cliente de compartición de la sesión (012b): las páginas son de servidor y solo pasan la URL. */
export function SessionMyFiles({
  apiPublicUrl,
  folderId,
}: {
  readonly apiPublicUrl: string;
  readonly folderId: string | null;
}): React.JSX.Element {
  return <MyFiles folderId={folderId} sharingApi={useSessionSharingApi(apiPublicUrl)} />;
}
