'use client';

import type * as React from 'react';

import { MyFiles, type MyFilesProps } from '../..';
import { useSessionSharingApi } from '../../../sharing';

import { PreviewMenuItem } from './PreviewMenuItem';

type PreviewFilesProps = Omit<MyFilesProps, 'firstAction' | 'sharingApi'> & {
  readonly apiPublicUrl: string;
};

/** Puente cliente: los wrappers de ruta solo pasan ubicación, URL de la API e ID de foco serializables. */
export function PreviewFiles({ apiPublicUrl, ...props }: PreviewFilesProps): React.JSX.Element {
  const sharingApi = useSessionSharingApi(apiPublicUrl);
  return <MyFiles {...props} sharingApi={sharingApi} firstAction={PreviewMenuItem} />;
}
