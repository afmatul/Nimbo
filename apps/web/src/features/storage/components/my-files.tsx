'use client';

import type { FileSummary, FolderRef, NodeSummary } from '@nimbo/contracts';
import { Folder } from 'lucide-react';
import * as React from 'react';

import { AppLayout, type NavItem } from '../../../components/nimbo/app-layout';
import { SignOutButton } from '../../identity/components/sign-out-button';
import {
  useFolderContents,
  useRootFolders,
  type FolderListing,
} from '../hooks/use-folder-contents';
import { useUploads } from '../hooks/use-upload-manager';
import { folderPath } from '../routes';

import { FileExplorer, placeNameOf } from './file-explorer';
import { DownloadNoticeBanner, FileRowMenu, type DownloadNotice } from './file-row-menu';
import { FolderBreadcrumbs } from './folder-breadcrumbs';
import { FolderNotFoundState } from './folder-not-found-state';
import { NewFolderDialog } from './new-folder-dialog';

/**
 * Carpetas primero; después los subidos en esta pestaña a esta ubicación (sin repetir los que el listado ya trae) y
 * luego los archivos listados (005 CA-1, 006 CA-6).
 */
function withUploaded(
  uploaded: readonly FileSummary[],
  folderId: string | null,
  listed: readonly NodeSummary[],
): readonly NodeSummary[] {
  const listedIds = new Set(listed.map((node) => node.id));
  const fresh: NodeSummary[] = uploaded
    .filter((file) => file.folderId === folderId && !listedIds.has(file.id))
    .map((file) => ({ type: 'file', ...file }));
  return [
    ...listed.filter((node) => node.type === 'folder'),
    ...fresh,
    ...listed.filter((node) => node.type === 'file'),
  ];
}

function readyContents(listing: FolderListing): {
  readonly breadcrumbs: readonly FolderRef[];
  readonly items: readonly NodeSummary[];
} {
  return listing.status === 'ready' ? listing.contents : { breadcrumbs: [], items: [] };
}

function toNavItem(folder: FolderRef): NavItem {
  return { label: folder.name, href: folderPath(folder.id), icon: Folder };
}

export interface MyFilesProps {
  /** Carpeta de la URL (`/archivos/carpeta/[folderId]`); `null` es la raíz (`/archivos`). */
  readonly folderId: string | null;
}

/**
 * Mis archivos y cada carpeta: lista la ubicación con sus migas, crea carpetas, sube a la carpeta abierta y descarga.
 * Si el listado falla, «Subir archivos» sigue habilitado y el panel de cargas no se entera.
 */
export function MyFiles({ folderId }: MyFilesProps): React.JSX.Element {
  const { api, enqueue, fileInputRef, uploadedFiles } = useUploads();
  const load = React.useCallback((id: string | null) => api.folderContents(id), [api]);
  const { listing, reload, addFolder } = useFolderContents(load, folderId);
  const rootFolders = useRootFolders(load, folderId, listing);
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const requestUrl = React.useCallback((fileId: string) => api.downloadUrl(fileId), [api]);
  const { breadcrumbs, items } = readyContents(listing);

  const refresh = React.useCallback(() => {
    setNotice(null);
    reload();
  }, [reload]);

  return (
    <AppLayout
      topBar={listing.status === 'ready' ? <FolderBreadcrumbs breadcrumbs={breadcrumbs} /> : null}
      folderItems={rootFolders.map(toNavItem)}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <SignOutButton />
        </div>
        {listing.status === 'not_found' ? (
          <FolderNotFoundState />
        ) : (
          <FileExplorer
            status={listing.status}
            folderId={folderId}
            breadcrumbs={breadcrumbs}
            nodes={withUploaded(uploadedFiles, folderId, items)}
            onFiles={(files) => enqueue(files, folderId)}
            onRetry={reload}
            onNewFolder={() => setCreatingFolder(true)}
            fileInputRef={fileInputRef}
            renderRowActions={(node) =>
              node.type === 'file' ? (
                <FileRowMenu
                  file={node}
                  requestUrl={requestUrl}
                  onNotice={setNotice}
                  onRefresh={refresh}
                />
              ) : null
            }
            notice={
              notice ? (
                <DownloadNoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
              ) : undefined
            }
          />
        )}
      </div>
      <NewFolderDialog
        open={creatingFolder}
        onOpenChange={setCreatingFolder}
        parentId={folderId}
        destinationName={placeNameOf(folderId, breadcrumbs)}
        siblingFolderNames={items.flatMap((node) => (node.type === 'folder' ? [node.name] : []))}
        createFolder={(body) => api.createFolder(body)}
        onCreated={addFolder}
      />
    </AppLayout>
  );
}
