'use client';

import * as React from 'react';

import { showNotice } from '../../../components/ui/sonner';
import { SignOutButton } from '../../identity/components/sign-out-button';
import { IndexingBanner } from '../../intelligence/components/indexing-banner';
import {
  useIndexingStatus,
  type IndexingStatusView,
} from '../../intelligence/hooks/use-indexing-status';
import type { IndexingApi } from '../../intelligence/indexing-api';
import { indexedNotice } from '../../intelligence/indexing-messages';
import { OptimizationCard } from '../../optimizer/components/optimization-card';
import type { OptimizerApi } from '../../optimizer/optimizer-api';
import type { ShareTarget } from '../../sharing';
import type { useFileVersions, VersionsListing } from '../hooks/use-file-versions';
import { useUploads } from '../hooks/use-upload-manager';
import { useVersionActions, type VersionActions } from '../hooks/use-version-actions';
import { currentVersionOf } from '../version-history';

import { BackLink, CitedLocation, FileHeader } from './file-detail-header';
import { FileDetailsCard } from './file-details-card';
import { HistoryCard } from './file-history-card';
import { FileNotFoundState } from './file-not-found-state';
import { DownloadNoticeBanner, openInBrowser, type DownloadNotice } from './file-row-menu';
import { ReadOnlyActionsHint } from './read-only-notice';
import { RestoreVersionDialog } from './restore-version-dialog';
import { useSpace } from './space-provider';

/** Aviso de la barra lateral (p. ej. una descarga fallida desde un acceso rápido) y cómo cerrarlo. */
export interface SidebarNotice {
  readonly notice: DownloadNotice | null;
  readonly dismiss: () => void;
}

export interface OwnFileDetailProps {
  readonly fileId: string;
  readonly indexingApi: IndexingApi;
  readonly optimizerApi: OptimizerApi;
  readonly openUrl?: (url: string) => void;
  readonly citedLocation?: string | undefined;
  readonly history: ReturnType<typeof useFileVersions>;
  readonly sidebarNotice: SidebarNotice;
  readonly onShare: (target: ShareTarget) => void;
}

/** La ficha del propietario: historial, indexación, optimización y detalles (014, 019, 021). */
export function OwnFileDetail(props: OwnFileDetailProps): React.JSX.Element {
  const { fileId, history } = props;
  const actions = useOwnVersionActions(props);
  const indexing = useFileIndexing(props.indexingApi, fileId, history.listing);
  return (
    <>
      <ReadOnlyActionsHint />
      <FileDetailContent
        fileId={fileId}
        citedLocation={props.citedLocation}
        listing={history.listing}
        actions={actions}
        indexing={indexing}
        optimization={
          <FileOptimization api={props.optimizerApi} fileId={fileId} history={history} />
        }
        sidebarNotice={props.sidebarNotice}
        onRetry={history.reload}
        onShare={(name) => props.onShare({ nodeType: 'file', nodeId: fileId, name })}
      />
      <RestoreVersionDialog
        target={actions.restoreTarget}
        onConfirm={actions.confirmRestore}
        onClose={actions.closeRestore}
      />
    </>
  );
}

/** Descargar y restaurar versiones; tras restaurar se releen el historial y el espacio (014). */
function useOwnVersionActions(props: OwnFileDetailProps): VersionActions {
  const { api } = useUploads();
  const space = useSpace();
  return useVersionActions({
    api,
    fileId: props.fileId,
    reload: props.history.reload,
    onSpaceChanged: space.refresh,
    openUrl: props.openUrl ?? openInBrowser,
  });
}

/** Estado de indexación de la ficha; al terminar mientras se mira, un toast con el nombre del archivo (019 CA-14). */
function useFileIndexing(
  api: IndexingApi,
  fileId: string,
  listing: VersionsListing,
): IndexingStatusView {
  const fileName = React.useRef<string | null>(null);
  React.useEffect(() => {
    fileName.current = listing.status === 'ready' ? listing.file.name : null;
  }, [listing]);
  const onIndexed = React.useCallback(() => showNotice(indexedNotice(fileName.current)), []);
  return useIndexingStatus(api, fileId, onIndexed);
}

interface FileDetailContentProps {
  readonly fileId: string;
  readonly citedLocation: string | undefined;
  readonly listing: VersionsListing;
  readonly actions: VersionActions;
  readonly indexing: IndexingStatusView;
  readonly optimization: React.ReactNode;
  readonly sidebarNotice: SidebarNotice;
  readonly onRetry: () => void;
  /** «Compartir» con el nombre del archivo (012b CA-1). */
  readonly onShare: (name: string) => void;
}

function FileDetailContent(props: FileDetailContentProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SignOutButton />
      </div>
      {props.listing.status === 'not_found' ? <FileNotFoundState /> : <FoundFile {...props} />}
    </div>
  );
}

/** El aviso de una acción de versión manda sobre el de la barra lateral. */
function activeNotice(actions: VersionActions, sidebar: SidebarNotice): SidebarNotice {
  if (actions.notice) return { notice: actions.notice, dismiss: actions.dismissNotice };
  return sidebar;
}

/** Cabecera, indexación, optimización, historial y detalles del archivo (cargando, con error o listo). */
function FoundFile(props: FileDetailContentProps): React.JSX.Element {
  const { listing, actions, indexing } = props;
  const ready = listing.status === 'ready' ? listing : null;
  const { notice, dismiss } = activeNotice(actions, props.sidebarNotice);
  return (
    <>
      <BackLink folderId={ready?.file.folderId ?? null} />
      <div>
        <FileHeader
          ready={ready}
          actions={actions}
          indexing={indexing.status}
          fileId={props.fileId}
          onShare={props.onShare}
        />
        {ready ? <CitedLocation label={props.citedLocation} /> : null}
        <IndexingBanner status={indexing.status} retry={indexing.retry} />
      </div>
      {props.optimization}
      <HistoryCard listing={listing} actions={actions} onRetry={props.onRetry}>
        {notice ? <DownloadNoticeBanner notice={notice} onDismiss={dismiss} /> : null}
      </HistoryCard>
      {ready ? <FileDetailsCard listing={ready} indexing={indexing.status} /> : null}
    </>
  );
}

interface FileOptimizationProps {
  readonly api: OptimizerApi;
  readonly fileId: string;
  readonly history: ReturnType<typeof useFileVersions>;
}

const OPTIMIZABLE_IMAGE = /\.(jpe?g|png)$/i;

/** El historial ya autoriza la ficha; GET optimization confirma la propiedad antes de habilitar acciones. */
function FileOptimization({
  api,
  fileId,
  history,
}: FileOptimizationProps): React.JSX.Element | null {
  const space = useSpace();
  const { listing } = history;
  if (listing.status !== 'ready' || listing.file.kind !== 'imagen') return null;
  if (!OPTIMIZABLE_IMAGE.test(listing.file.name)) return null;
  return (
    <OptimizationCard
      key={`${fileId}:${currentVersionOf(listing.items)?.id ?? ''}`}
      api={api}
      fileId={fileId}
      history={listing}
      onCompleted={() => {
        history.reload();
        space.refresh();
      }}
    />
  );
}
