'use client';

import type { FileSummary } from '@nimbo/contracts';
import * as React from 'react';

import { useUploads } from '../hooks/use-upload-manager';

import { FileExplorer, type FileExplorerStatus } from './file-explorer';
import { DownloadNoticeBanner, FileRowMenu, type DownloadNotice } from './file-row-menu';

interface Listing {
  readonly status: FileExplorerStatus;
  readonly items: readonly FileSummary[];
}

const LOADING: Listing = { status: 'loading', items: [] };

/** Los recién subidos en esta pestaña van primero, sin repetir los que el listado ya trae (CA-1). */
function withUploaded(
  uploaded: readonly FileSummary[],
  listed: readonly FileSummary[],
): readonly FileSummary[] {
  const listedIds = new Set(listed.map((file) => file.id));
  return [...uploaded.filter((file) => !listedIds.has(file.id)), ...listed];
}

/** Primera página de la raíz. Al pedir otra vez, la respuesta de la petición anterior se descarta. */
function useRootListing(listFiles: () => Promise<{ readonly items: readonly FileSummary[] }>): {
  readonly listing: Listing;
  readonly reload: () => void;
} {
  const [listing, setListing] = React.useState<Listing>(LOADING);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    listFiles().then(
      ({ items }) => {
        if (current) setListing({ status: 'ready', items });
      },
      () => {
        if (current) setListing({ status: 'error', items: [] });
      },
    );
    return () => {
      current = false;
    };
  }, [listFiles, attempt]);

  const reload = React.useCallback(() => {
    setListing(LOADING);
    setAttempt((previous) => previous + 1);
  }, []);

  return { listing, reload };
}

/**
 * Vista de Mis archivos: encola en el manager de la pestaña lo que se elige o se suelta, lista la raíz y descarga. Si
 * el listado falla, «Subir archivos» sigue habilitado y el panel no se entera.
 */
export function MyFiles(): React.JSX.Element {
  const { api, enqueue, fileInputRef, uploadedFiles } = useUploads();
  const listFiles = React.useCallback(() => api.listFiles(), [api]);
  const requestUrl = React.useCallback((fileId: string) => api.downloadUrl(fileId), [api]);
  const { listing, reload } = useRootListing(listFiles);
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);

  const refresh = React.useCallback(() => {
    setNotice(null);
    reload();
  }, [reload]);

  return (
    <FileExplorer
      status={listing.status}
      files={withUploaded(uploadedFiles, listing.items)}
      onFiles={enqueue}
      onRetry={reload}
      fileInputRef={fileInputRef}
      renderRowActions={(file) => (
        <FileRowMenu file={file} requestUrl={requestUrl} onNotice={setNotice} onRefresh={refresh} />
      )}
      notice={
        notice ? (
          <DownloadNoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        ) : undefined
      }
    />
  );
}
