'use client';

import type * as React from 'react';

import { MyFiles, useSessionBatchApi, type MyFilesProps } from '../..';
import { useSessionSharingApi } from '../../../sharing';

import { PreviewMenuItem } from './PreviewMenuItem';

type PreviewFilesProps = Omit<MyFilesProps, 'firstAction' | 'sharingApi' | 'batchApi'> & {
  readonly apiPublicUrl: string;
};

/** Puente cliente: los wrappers de ruta solo pasan ubicación, URL de la API e ID de foco serializables. */
export function PreviewFiles({ apiPublicUrl, ...props }: PreviewFilesProps): React.JSX.Element {
  const sharingApi = useSessionSharingApi(apiPublicUrl);
  const batchApi = useSessionBatchApi(apiPublicUrl);
  return (
    <MyFiles {...props} sharingApi={sharingApi} batchApi={batchApi} firstAction={PreviewMenuItem} />
  );
}
