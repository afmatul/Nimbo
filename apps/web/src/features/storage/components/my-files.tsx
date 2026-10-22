'use client';

import type { NodeSummary } from '@nimbo/contracts';
import type * as React from 'react';

import { AppLayout } from '../../../components/nimbo/app-layout';
import { SignOutButton } from '../../identity/components/sign-out-button';
import {
  maxFileLabelOf,
  useMyFilesState,
  type MyFilesState,
  type RowActionHandlers,
} from '../hooks/use-my-files-state';

import { FileExplorer, type FileExplorerStatus } from './file-explorer';
import { DownloadNoticeBanner, FileRowMenu, type DownloadNotice } from './file-row-menu';
import { FolderBreadcrumbs } from './folder-breadcrumbs';
import { FolderNotFoundState } from './folder-not-found-state';
import { FolderRowMenu } from './folder-row-menu';
import { MyFilesDialogs } from './my-files-dialogs';
import { QuickAccessLimitAlert } from './quick-access-limit-alert';
import { ReadOnlyNotice } from './read-only-notice';
import { SidebarQuota } from './sidebar-quota';

/** Menú ⋮ de una fila: descargar (archivos), renombrar, mover, fijar en la barra lateral y mandar a la papelera. */
function RowActions({
  node,
  handlers,
}: {
  readonly node: NodeSummary;
  readonly handlers: RowActionHandlers;
}): React.JSX.Element {
  const common = {
    onRename: () => handlers.organize({ action: 'rename', node }),
    onMove: () => handlers.organize({ action: 'move', node }),
    onMoveToTrash: () => void handlers.moveToTrash(node),
    pin: handlers.pinToggleFor(node),
  };
  if (node.type === 'folder') return <FolderRowMenu folder={node} {...common} />;
  return (
    <FileRowMenu
      file={node}
      requestUrl={handlers.requestUrl}
      onNotice={handlers.onNotice}
      onRefresh={handlers.onRefresh}
      {...common}
    />
  );
}

/** Arriba de la lista: el tope de fijados (CA-28) y el fallo de una descarga (005 CA-21); `undefined` sin avisos. */
function explorerNotices(
  quickAccess: MyFilesState['sidebar']['quickAccess'],
  notice: DownloadNotice | null,
  onDismissNotice: () => void,
): React.ReactNode {
  if (quickAccess.limit === null && notice === null) return undefined;
  return (
    <div className="space-y-3">
      {quickAccess.limit === null ? null : (
        <QuickAccessLimitAlert maxPinned={quickAccess.limit} onDismiss={quickAccess.dismissLimit} />
      )}
      {notice ? <DownloadNoticeBanner notice={notice} onDismiss={onDismissNotice} /> : null}
    </div>
  );
}

/** El explorador de la ubicación abierta con sus avisos, cargas, desglose, orden y «Cargar más». */
function MyFilesExplorer({
  state,
  status,
}: {
  readonly state: MyFilesState;
  readonly status: FileExplorerStatus;
}): React.JSX.Element {
  const { contents, notices, uploads, folderId } = state;
  return (
    <FileExplorer
      status={status}
      folderId={folderId}
      breadcrumbs={state.view.breadcrumbs}
      nodes={state.view.nodes}
      maxFileLabel={maxFileLabelOf(state.sidebar.space)}
      onFiles={(files) => uploads.enqueue(files, folderId)}
      onRetry={contents.reload}
      onNewFolder={() => state.creating.setOpen(true)}
      fileInputRef={uploads.fileInputRef}
      disclosure={state.view.disclosure}
      controls={contents.controls}
      renderRowActions={(node) => <RowActions node={node} handlers={state.rowActions} />}
      notice={explorerNotices(state.sidebar.quickAccess, notices.notice, () =>
        notices.setNotice(null),
      )}
    />
  );
}

export interface MyFilesProps {
  /** Carpeta de la URL (`/archivos/carpeta/[folderId]`); `null` es la raíz (`/archivos`). */
  readonly folderId: string | null;
}

/**
 * Mis archivos y cada carpeta: lista la ubicación con sus migas, crea carpetas, sube a la carpeta abierta, descarga,
 * renombra, mueve y manda a la papelera (con accesos rápidos, el contador de la Papelera y la tarjeta de cuota en la barra
 * lateral).
 */
export function MyFiles({ folderId }: MyFilesProps): React.JSX.Element {
  const state = useMyFilesState(folderId);
  const { listing } = state.contents;
  return (
    <AppLayout
      topBar={
        listing.status === 'ready' ? (
          <FolderBreadcrumbs breadcrumbs={state.view.breadcrumbs} />
        ) : null
      }
      sidebarSection={state.sidebar.sidebarSection}
      trashCount={state.sidebar.trashCount}
      quotaCard={<SidebarQuota state={state.sidebar.space} />}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <SignOutButton />
        </div>
        <ReadOnlyNotice />
        {listing.status === 'not_found' ? (
          <FolderNotFoundState />
        ) : (
          <MyFilesExplorer state={state} status={listing.status} />
        )}
      </div>
      <MyFilesDialogs state={state} />
    </AppLayout>
  );
}
