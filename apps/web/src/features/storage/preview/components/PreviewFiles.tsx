'use client';

import type { FileSummary } from '@nimbo/contracts';
import * as React from 'react';

import { MyFiles, ThumbnailProvider, type MyFilesProps } from '../..';
import { useSessionSharingApi } from '../../../sharing';

import { FileThumbnail } from './FileThumbnail';
import { PreviewMenuItem } from './PreviewMenuItem';
import { QuickLookDialog } from './QuickLookDialog';

type PreviewFilesProps = Omit<MyFilesProps, 'firstAction' | 'sharingApi' | 'renderQuickLook'> & {
  readonly apiPublicUrl: string;
};

/** Puente cliente: los wrappers de ruta solo pasan ubicación, URL de la API e ID de foco serializables. */
export function PreviewFiles({ apiPublicUrl, ...props }: PreviewFilesProps): React.JSX.Element {
  const sharingApi = useSessionSharingApi(apiPublicUrl);
  const renderThumbnail = React.useCallback(
    (file: FileSummary) => <FileThumbnail file={file} apiPublicUrl={apiPublicUrl} />,
    [apiPublicUrl],
  );
  return (
    <ThumbnailProvider value={renderThumbnail}>
      <MyFiles
        {...props}
        sharingApi={sharingApi}
        firstAction={PreviewMenuItem}
        renderQuickLook={(file, onClose) => (
          <QuickLookDialog file={file} apiPublicUrl={apiPublicUrl} onClose={onClose} />
        )}
      />
    </ThumbnailProvider>
  );
}
