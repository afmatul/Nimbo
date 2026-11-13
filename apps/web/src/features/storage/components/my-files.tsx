'use client';

import type { FileSummary, NodeAccessLevel, NodeSummary } from '@nimbo/contracts';
import * as React from 'react';

import { AppLayout } from '../../../components/nimbo/app-layout';
import { ShareDialog, type ShareTarget, type SharingApi } from '../../sharing';
import type { BatchApi } from '../batch-api';
import type { FolderListing } from '../hooks/use-folder-contents';
import {
  maxFileLabelOf,
  useMyFilesState,
  type MyFilesState,
  type RowActionHandlers,
} from '../hooks/use-my-files-state';
import { useNodeSelection, type NodeSelection } from '../hooks/use-node-selection';
import { useReturnFocus } from '../hooks/use-return-focus';
import { isOwner } from '../node-access';

import { ExplorerBatch } from './explorer-batch';
import { FileExplorer, type FileExplorerStatus } from './file-explorer';
import { DownloadNoticeBanner, FileRowMenu, type DownloadNotice } from './file-row-menu';
import { FolderBreadcrumbs, SHARED_ROOT_CRUMB } from './folder-breadcrumbs';
import { FolderNotFoundState } from './folder-not-found-state';
import { FolderRowMenu } from './folder-row-menu';
import { MyFilesDialogs } from './my-files-dialogs';
import { QuickAccessLimitAlert } from './quick-access-limit-alert';
import { ReadOnlyNotice } from './read-only-notice';
import { SidebarQuota } from './sidebar-quota';

/**
 * Acción que otro módulo agrega como primer ítem del menú de cada archivo (017: «Previsualizar»). Solo recibe el
 * archivo: no ve el estado del explorador. Es un componente de cliente, así que la provee un envoltorio de cliente.
 */
export type FirstFileAction = React.ComponentType<{ readonly file: FileSummary }>;

/** Lo que la fila necesita para «Compartir»: el nivel de la ubicación abierta y quién abre el diálogo (012b). */
interface RowShare {
  readonly level: NodeAccessLevel;
  readonly open: (target: ShareTarget) => void;
}

/** Menú ⋮ de una fila: descargar, renombrar, mover, fijar en la barra lateral, compartir y mandar a la papelera. */
function RowActions({
  node,
  handlers,
  share,
  FirstAction,
}: {
  readonly node: NodeSummary;
  readonly handlers: RowActionHandlers;
  readonly share: RowShare;
  readonly FirstAction: FirstFileAction | undefined;
}): React.JSX.Element {
  const common = {
    onRename: () => handlers.organize({ action: 'rename', node }),
    onMove: () => handlers.organize({ action: 'move', node }),
    onMoveToTrash: () => void handlers.moveToTrash(node),
    pin: handlers.pinToggleFor(node),
    sharing: {
      level: share.level,
      onShare: () => share.open({ nodeType: node.type, nodeId: node.id, name: node.name }),
    },
  };
  if (node.type === 'folder') return <FolderRowMenu folder={node} {...common} />;
  return (
    <FileRowMenu
      file={node}
      requestUrl={handlers.requestUrl}
      onNotice={handlers.onNotice}
      onRefresh={handlers.onRefresh}
      firstAction={FirstAction ? <FirstAction file={node} /> : undefined}
      {...common}
    />
  );
}

/** Nivel sobre la ubicación abierta (012 CA-13); mientras carga o si falla, el del propietario: la API decide. */
function accessLevelOf(listing: FolderListing): NodeAccessLevel {
  return listing.status === 'ready' ? listing.contents.accessLevel : 'OWNER';
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

/** Selección múltiple con su cliente de lotes: solo en lo propio (los lotes piden ser propietario). */
interface BatchSelection {
  readonly api: BatchApi;
  readonly selection: NodeSelection;
}

/** Tras un lote: relee la lista (y lo desglosado) y la barra lateral (papelera, espacio y fijados). */
function batchNotice(state: MyFilesState, batch: BatchSelection | null): React.ReactNode {
  if (batch === null) return null;
  const onChanged = (): void => {
    state.notices.refresh();
    state.sidebar.onMovedToTrash();
  };
  return <ExplorerBatch {...batch} folderContents={state.load} onChanged={onChanged} />;
}

/** Avisos sobre la lista (fijados, descarga) y la barra de selección; `undefined` si no hay ninguno. */
function noticesOf(state: MyFilesState, batch: BatchSelection | null): React.ReactNode {
  const { notices } = state;
  const top = explorerNotices(state.sidebar.quickAccess, notices.notice, () =>
    notices.setNotice(null),
  );
  if (top === undefined && batch === null) return undefined;
  return (
    <div className="space-y-3">
      {top}
      {batchNotice(state, batch)}
    </div>
  );
}

/** El explorador de la ubicación abierta con sus avisos, cargas, desglose, orden y «Cargar más». */
interface MyFilesExplorerProps {
  readonly state: MyFilesState;
  readonly status: FileExplorerStatus;
  readonly share: RowShare;
  readonly firstAction: FirstFileAction | undefined;
  readonly batch: BatchSelection | null;
  readonly onQuickLook: ((file: FileSummary) => void) | undefined;
}

function MyFilesExplorer({
  state,
  status,
  share,
  firstAction,
  batch,
  onQuickLook,
}: MyFilesExplorerProps): React.JSX.Element {
  const { contents, uploads, folderId } = state;
  return (
    <FileExplorer
      status={status}
      accessLevel={share.level}
      folderId={folderId}
      breadcrumbs={state.view.breadcrumbs}
      nodes={state.view.nodes}
      maxFileLabel={maxFileLabelOf(state.sidebar.space)}
      onFiles={(files) => uploads.enqueue(files, folderId)}
      onRetry={contents.reload}
      onNewFolder={() => state.creating.setOpen(true)}
      fileInputRef={uploads.fileInputRef}
      disclosure={state.view.disclosure}
      selection={batch?.selection}
      defaultView="tarjetas"
      onQuickLook={onQuickLook}
      controls={contents.controls}
      renderRowActions={(node) => (
        <RowActions
          node={node}
          handlers={state.rowActions}
          share={share}
          FirstAction={firstAction}
        />
      )}
      notice={noticesOf(state, batch)}
    />
  );
}

/**
 * Migas en la barra superior cuando la ubicación ya cargó y hay al menos una carpeta abierta; lo compartido conmigo
 * arranca en «Compartidos» (012b CA-9). En la raíz no: «Mis archivos» ya es el título y el ítem activo de la barra.
 */
function topBarOf(state: MyFilesState, level: NodeAccessLevel): React.ReactNode {
  if (state.contents.listing.status !== 'ready') return null;
  if (state.view.breadcrumbs.length === 0) return null;
  const root = isOwner(level) ? {} : { root: SHARED_ROOT_CRUMB };
  return <FolderBreadcrumbs breadcrumbs={state.view.breadcrumbs} {...root} />;
}

export interface MyFilesProps {
  /** Carpeta de la URL (`/archivos/carpeta/[folderId]`); `null` es la raíz (`/archivos`). */
  readonly folderId: string | null;
  /** Cliente de compartición del diálogo «Compartir» (012b). */
  readonly sharingApi: SharingApi;
  /** Archivo cuya fila recibe el foco al volver de la vista previa (017 §6); sin él, el foco no se mueve. */
  readonly returnFocusId?: string | null;
  /** Primer ítem del menú de cada archivo; sin él, el menú queda como en 005/006. */
  readonly firstAction?: FirstFileAction;
  /** Cliente de los lotes (selección múltiple); sin él la lista no tiene casillas. */
  readonly batchApi?: BatchApi;
  /** «Vista rápida» de una tarjeta (017): quien compone da el diálogo; sin él las tarjetas no ofrecen el botón. */
  readonly renderQuickLook?: (file: FileSummary | null, onClose: () => void) => React.ReactNode;
}

const ROOT_SCOPE = 'raiz';

/** La selección de la ubicación abierta, solo si hay cliente de lotes y el actor es el propietario. */
function useBatchSelection(
  state: MyFilesState,
  level: NodeAccessLevel,
  api: BatchApi | undefined,
): BatchSelection | null {
  const selection = useNodeSelection(state.view.nodes, state.folderId ?? ROOT_SCOPE);
  return api === undefined || !isOwner(level) ? null : { api, selection };
}

/**
 * Mis archivos y cada carpeta: lista la ubicación con sus migas, crea carpetas, sube a la carpeta abierta, descarga,
 * renombra, mueve y manda a la papelera (con accesos rápidos, el contador de la Papelera y la tarjeta de cuota en la barra
 * lateral).
 */
export function MyFiles({
  folderId,
  sharingApi,
  returnFocusId = null,
  firstAction,
  batchApi,
  renderQuickLook,
}: MyFilesProps): React.JSX.Element {
  const state = useMyFilesState(folderId);
  const { listing } = state.contents;
  useReturnFocus(listing.status, returnFocusId);
  const [sharing, setSharing] = React.useState<ShareTarget | null>(null);
  const share: RowShare = { level: accessLevelOf(listing), open: setSharing };
  const batch = useBatchSelection(state, share.level, batchApi);
  const [quickFile, setQuickFile] = React.useState<FileSummary | null>(null);
  return (
    <AppLayout
      topBar={topBarOf(state, share.level)}
      sidebarSection={state.sidebar.sidebarSection}
      trashCount={state.sidebar.trashCount}
      quotaCard={<SidebarQuota state={state.sidebar.space} />}
    >
      <div className="space-y-4">
        <ReadOnlyNotice />
        {listing.status === 'not_found' ? (
          <FolderNotFoundState />
        ) : (
          <MyFilesExplorer
            state={state}
            status={listing.status}
            share={share}
            firstAction={firstAction}
            batch={batch}
            onQuickLook={renderQuickLook ? setQuickFile : undefined}
          />
        )}
      </div>
      <MyFilesDialogs state={state} />
      {renderQuickLook?.(quickFile, () => setQuickFile(null))}
      <ShareDialog api={sharingApi} target={sharing} onClose={() => setSharing(null)} />
    </AppLayout>
  );
}
