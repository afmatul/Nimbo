'use client';

import type {
  FileSummary,
  FolderContentsResponse,
  FolderRef,
  FolderSummary,
  NodeSummary,
} from '@nimbo/contracts';
import { Folder } from 'lucide-react';
import * as React from 'react';

import { AppLayout, type NavItem } from '../../../components/nimbo/app-layout';
import { SignOutButton } from '../../identity/components/sign-out-button';
import {
  useFolderContents,
  useRootFolders,
  type FolderListing,
} from '../hooks/use-folder-contents';
import {
  toFolderDisclosure,
  useFolderDisclosure,
  type FolderDisclosureState,
} from '../hooks/use-folder-disclosure';
import { useMoveToTrash } from '../hooks/use-move-to-trash';
import { useTrashCount } from '../hooks/use-trash-count';
import { useUploads } from '../hooks/use-upload-manager';
import {
  locationOf,
  withArrivals,
  withOrganized,
  withOrganizedRootFolders,
  type OrganizedNodes,
} from '../organized-nodes';
import { folderPath } from '../routes';

import { FileExplorer, placeNameOf } from './file-explorer';
import { DownloadNoticeBanner, FileRowMenu, type DownloadNotice } from './file-row-menu';
import { FolderBreadcrumbs } from './folder-breadcrumbs';
import { FolderNotFoundState } from './folder-not-found-state';
import { FolderRowMenu } from './folder-row-menu';
import { MoveDialog } from './move-dialog';
import { NewFolderDialog } from './new-folder-dialog';
import { RenameDialog } from './rename-dialog';

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

/** Lo que esta pestaña ya sabe y el listado aún no: cargas, renombrados o movidos y enviados a la papelera. */
interface LocalChanges {
  readonly uploaded: readonly FileSummary[];
  readonly organized: OrganizedNodes;
  readonly trashedIds: ReadonlySet<string>;
}

/** Lo que se ve de una ubicación (la abierta o una carpeta desglosada, CA-26) con los cambios de la pestaña. */
function visibleAt(
  changes: LocalChanges,
  folderId: string | null,
  listed: readonly NodeSummary[],
): readonly NodeSummary[] {
  const withLocal = withUploaded(
    changes.uploaded,
    folderId,
    withArrivals(listed, changes.organized, folderId),
  );
  return withOrganized(withLocal, changes.organized, folderId).filter(
    (node) => !changes.trashedIds.has(node.id),
  );
}

/** Migas y contenido visible de una ubicación. */
interface Level {
  readonly breadcrumbs: readonly FolderRef[];
  readonly nodes: readonly NodeSummary[];
}

function readyContents(
  listing: FolderListing,
): Pick<FolderContentsResponse, 'breadcrumbs' | 'items'> {
  return listing.status === 'ready' ? listing.contents : { breadcrumbs: [], items: [] };
}

/**
 * Nivel donde está el elemento: la ubicación abierta o la carpeta desglosada que lo muestra. Así «Renombrar» y
 * «Mover a…» comparan con sus hermanas y parten de su carpeta, en cualquier nivel (CA-26).
 */
function levelOfNode(
  node: NodeSummary,
  opened: Level & { readonly folderId: string | null },
  disclosed: { readonly state: FolderDisclosureState; readonly changes: LocalChanges },
): Level {
  const location = locationOf(node);
  const listing = location === null ? undefined : disclosed.state.listingOf(location);
  if (location === opened.folderId || listing?.status !== 'ready') return opened;
  const { breadcrumbs, items } = listing.contents;
  return { breadcrumbs, nodes: visibleAt(disclosed.changes, location, items) };
}

/** Elemento con «Renombrar» o «Mover a…» abierto (006 CA-4, CA-7). */
interface Organizing {
  readonly action: 'rename' | 'move';
  readonly node: NodeSummary;
}

function folderNamesOf(nodes: readonly NodeSummary[]): readonly string[] {
  return nodes.flatMap((node) => (node.type === 'folder' ? [node.name] : []));
}

function toNavItem(folder: FolderRef): NavItem {
  return { label: folder.name, href: folderPath(folder.id), icon: Folder };
}

export interface MyFilesProps {
  /** Carpeta de la URL (`/archivos/carpeta/[folderId]`); `null` es la raíz (`/archivos`). */
  readonly folderId: string | null;
}

/**
 * Mis archivos y cada carpeta: lista la ubicación con sus migas, crea carpetas, sube a la carpeta abierta, descarga,
 * renombra, mueve y manda a la papelera (con el contador de la Papelera en la barra lateral).
 * Si el listado falla, «Subir archivos» sigue habilitado y el panel de cargas no se entera.
 */
export function MyFiles({ folderId }: MyFilesProps): React.JSX.Element {
  const { api, enqueue, fileInputRef, uploadedFiles, reviseUploaded } = useUploads();
  const load = React.useCallback((id: string | null) => api.folderContents(id), [api]);
  const { listing, reload, addFolder } = useFolderContents(load, folderId);
  const rootFolders = useRootFolders(load, folderId, listing);
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [organizing, setOrganizing] = React.useState<Organizing | null>(null);
  const [organized, setOrganized] = React.useState<OrganizedNodes>(() => new Map());
  const requestUrl = React.useCallback((fileId: string) => api.downloadUrl(fileId), [api]);
  const { breadcrumbs, items } = readyContents(listing);
  const disclosed = useFolderDisclosure(load);
  const refresh = (): void => {
    setNotice(null);
    reload();
    disclosed.refreshAll();
  };
  const trashCount = useTrashCount(api);
  const { trashedIds, moveToTrash } = useMoveToTrash({
    api,
    onMoved: trashCount.refresh,
    onNotice: setNotice,
    onRefresh: refresh,
  });
  const changes: LocalChanges = { uploaded: uploadedFiles, organized, trashedIds };
  const nodes = visibleAt(changes, folderId, items);
  const disclosure = toFolderDisclosure(disclosed, (id, contents) =>
    visibleAt(changes, id, contents.items),
  );
  const organizingLevel =
    organizing === null
      ? null
      : levelOfNode(
          organizing.node,
          { folderId, breadcrumbs, nodes },
          { state: disclosed, changes },
        );

  const remember = React.useCallback(
    (node: NodeSummary) => {
      setOrganized((previous) => new Map(previous).set(node.id, node));
      if (node.type === 'file') reviseUploaded(node);
    },
    [reviseUploaded],
  );

  const folderCreatedFromMove = React.useCallback(
    (folder: FolderSummary) => {
      if (folder.parentId === folderId) addFolder(folder);
      remember({ type: 'folder', ...folder });
    },
    [addFolder, folderId, remember],
  );

  return (
    <AppLayout
      topBar={listing.status === 'ready' ? <FolderBreadcrumbs breadcrumbs={breadcrumbs} /> : null}
      folderItems={withOrganizedRootFolders(rootFolders, organized)
        .filter((folder) => !trashedIds.has(folder.id))
        .map(toNavItem)}
      trashCount={trashCount.count}
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
            nodes={nodes}
            onFiles={(files) => enqueue(files, folderId)}
            onRetry={reload}
            onNewFolder={() => setCreatingFolder(true)}
            fileInputRef={fileInputRef}
            disclosure={disclosure}
            renderRowActions={(node) =>
              node.type === 'file' ? (
                <FileRowMenu
                  file={node}
                  requestUrl={requestUrl}
                  onNotice={setNotice}
                  onRefresh={refresh}
                  onRename={() => setOrganizing({ action: 'rename', node })}
                  onMove={() => setOrganizing({ action: 'move', node })}
                  onMoveToTrash={() => void moveToTrash(node)}
                />
              ) : (
                <FolderRowMenu
                  folder={node}
                  onRename={() => setOrganizing({ action: 'rename', node })}
                  onMove={() => setOrganizing({ action: 'move', node })}
                  onMoveToTrash={() => void moveToTrash(node)}
                />
              )
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
        siblingFolderNames={folderNamesOf(nodes)}
        createFolder={(body) => api.createFolder(body)}
        onCreated={addFolder}
      />
      {organizing?.action === 'rename' ? (
        <RenameDialog
          key={organizing.node.id}
          node={organizing.node}
          siblingFolderNames={folderNamesOf(organizingLevel?.nodes ?? nodes)}
          renameFile={(fileId, body) => api.renameFile(fileId, body)}
          renameFolder={(id, body) => api.renameFolder(id, body)}
          onRenamed={remember}
          onClose={() => setOrganizing(null)}
        />
      ) : null}
      {organizing?.action === 'move' ? (
        <MoveDialog
          key={organizing.node.id}
          node={organizing.node}
          breadcrumbs={organizingLevel?.breadcrumbs ?? breadcrumbs}
          folderContents={load}
          createFolder={(body) => api.createFolder(body)}
          moveFile={(fileId, body) => api.moveFile(fileId, body)}
          moveFolder={(id, body) => api.moveFolder(id, body)}
          onMoved={remember}
          onFolderCreated={folderCreatedFromMove}
          onClose={() => setOrganizing(null)}
        />
      ) : null}
    </AppLayout>
  );
}
