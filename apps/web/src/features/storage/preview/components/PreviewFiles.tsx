'use client';

import type { FileSummary } from '@nimbo/contracts';
import * as React from 'react';

import {
  FileBadgeProvider,
  MyFiles,
  ThumbnailProvider,
  type FileBadgeRenderer,
  type MyFilesProps,
} from '../..';
import { useAuthFetch } from '../../../identity/session/use-auth-fetch';
import { IndexingCardBadge } from '../../../intelligence/components/indexing-card-badge';
import { createIndexingApi } from '../../../intelligence/indexing-api';
import { useSessionSharingApi } from '../../../sharing';
import { createStorageHttp } from '../../storage-http';

import { FileThumbnail } from './FileThumbnail';
import { PreviewMenuItem } from './PreviewMenuItem';
import { QuickLookDialog } from './QuickLookDialog';

type PreviewFilesProps = Omit<MyFilesProps, 'firstAction' | 'sharingApi' | 'renderQuickLook'> & {
  readonly apiPublicUrl: string;
};

/** Insignia de indexación de cada tarjeta, con el cliente de indexación de la sesión (019). */
function useIndexingBadge(apiPublicUrl: string): FileBadgeRenderer {
  const authFetch = useAuthFetch();
  const api = React.useMemo(
    () => createIndexingApi(createStorageHttp(apiPublicUrl, authFetch)),
    [apiPublicUrl, authFetch],
  );
  return React.useCallback(
    (file: FileSummary) => <IndexingCardBadge api={api} file={file} />,
    [api],
  );
}

/** Puente cliente: los wrappers de ruta solo pasan ubicación, URL de la API e ID de foco serializables. */
export function PreviewFiles({ apiPublicUrl, ...props }: PreviewFilesProps): React.JSX.Element {
  const sharingApi = useSessionSharingApi(apiPublicUrl);
  const renderThumbnail = React.useCallback(
    (file: FileSummary) => <FileThumbnail file={file} apiPublicUrl={apiPublicUrl} />,
    [apiPublicUrl],
  );
  const renderBadge = useIndexingBadge(apiPublicUrl);
  return (
    <ThumbnailProvider value={renderThumbnail}>
      <FileBadgeProvider value={renderBadge}>
        <MyFiles
          {...props}
          sharingApi={sharingApi}
          firstAction={PreviewMenuItem}
          renderQuickLook={(file, onClose) => (
            <QuickLookDialog file={file} apiPublicUrl={apiPublicUrl} onClose={onClose} />
          )}
        />
      </FileBadgeProvider>
    </ThumbnailProvider>
  );
}
