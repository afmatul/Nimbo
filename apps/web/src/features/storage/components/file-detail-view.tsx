'use client';

import * as React from 'react';

import { AppLayout, type AppLayoutProps } from '../../../components/nimbo/app-layout';
import { openInBrowser } from '../../../lib/use-preparing-download';
import type { IndexingApi } from '../../intelligence/indexing-api';
import type { OptimizerApi } from '../../optimizer/optimizer-api';
import { ShareDialog, type ShareTarget, type SharingApi } from '../../sharing';
import type { StorageApi } from '../api';
import { useFileVersions, type VersionsListing } from '../hooks/use-file-versions';
import { useRecordFileOpen } from '../hooks/use-quick-access';
import { useSharedFile } from '../hooks/use-shared-file';
import { useTrashCount } from '../hooks/use-trash-count';
import { useUploads } from '../hooks/use-upload-manager';

import { DownloadNoticeBanner, type DownloadNotice } from './file-row-menu';
import { OwnFileDetail, type SidebarNotice } from './own-file-detail';
import { useQuickAccessSidebar } from './quick-access-sidebar';
import { ReadOnlyNotice } from './read-only-notice';
import { SharedFileDetail } from './shared-file-detail';
import { SidebarQuota } from './sidebar-quota';
import { useSpace } from './space-provider';

export interface FileDetailViewProps {
  readonly fileId: string;
  /** Estado de indexación del archivo (019). */
  readonly indexingApi: IndexingApi;
  readonly optimizerApi: OptimizerApi;
  /** «Compartir» del propietario (012b CA-1). */
  readonly sharingApi: SharingApi;
  /** Abre la URL firmada; por omisión, en la pestaña (005 CA-13). */
  readonly openUrl?: (url: string) => void;
  /** Etiqueta de la cita que trajo hasta aquí (`?ubicacion=`, 020b CA-11); se pinta como texto, nunca se registra. */
  readonly citedLocation?: string | undefined;
}

/** Mientras se confirma si el archivo está compartido conmigo, la ficha sigue «cargando» (no «no encontrado»). */
const LOADING_LISTING: VersionsListing = { status: 'loading' };

type SidebarLayout = Pick<AppLayoutProps, 'sidebarSection' | 'trashCount' | 'quotaCard'>;

/**
 * Barra lateral de la ficha (accesos rápidos, Papelera y cuota) y el aviso que dejan sus accesos rápidos. Abrir la
 * ficha cuenta como abrir el archivo: queda en «Recientes» (006 CA-27); si no es propio, la API lo ignora.
 */
function useDetailSidebar(
  api: StorageApi,
  fileId: string,
): {
  readonly layout: SidebarLayout;
  readonly notice: SidebarNotice;
} {
  const space = useSpace();
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const sidebar = useQuickAccessSidebar({ api, openedFolderId: null, onNotice: setNotice });
  const trash = useTrashCount(api);
  useRecordFileOpen(api, fileId);
  return {
    layout: {
      sidebarSection: sidebar.sidebarSection,
      trashCount: trash.count,
      quotaCard: <SidebarQuota state={space.state} />,
    },
    notice: { notice, dismiss: () => setNotice(null) },
  };
}

/** En la ficha compartida (sin historial) el aviso de los accesos rápidos va arriba, como en las demás páginas. */
function SidebarNoticeBanner({ notice }: { readonly notice: SidebarNotice }): React.ReactNode {
  if (notice.notice === null) return null;
  return <DownloadNoticeBanner notice={notice.notice} onDismiss={notice.dismiss} />;
}

/**
 * Ficha de un archivo con su historial de versiones (spec 014, mockup `storage/ficha-archivo`, D-10): descargar cualquier
 * versión, restaurar las anteriores con confirmación y los detalles de espacio, con el estado de indexación (019) y
 * «Compartir» (012b). Si el archivo está compartido conmigo, la ficha sin historial (012b CA-9). Sin panel lateral; se
 * llega desde «Ver historial» del menú ⋮ o desde «Compartidos conmigo».
 */
export function FileDetailView(props: FileDetailViewProps): React.JSX.Element {
  const { fileId, openUrl = openInBrowser } = props;
  const { api } = useUploads();
  const sidebar = useDetailSidebar(api, fileId);
  const history = useFileVersions(api, fileId);
  const shared = useSharedFile(api, fileId, history.listing);
  const [sharing, setSharing] = React.useState<ShareTarget | null>(null);
  const listing = shared.status === 'loading' ? LOADING_LISTING : history.listing;
  return (
    <AppLayout {...sidebar.layout}>
      <ReadOnlyNotice />
      {shared.status === 'shared' ? (
        <>
          <SidebarNoticeBanner notice={sidebar.notice} />
          <SharedFileDetail detail={shared.detail} api={api} openUrl={openUrl} />
        </>
      ) : (
        <OwnFileDetail
          {...props}
          history={{ listing, reload: history.reload }}
          sidebarNotice={sidebar.notice}
          onShare={setSharing}
        />
      )}
      <ShareDialog api={props.sharingApi} target={sharing} onClose={() => setSharing(null)} />
    </AppLayout>
  );
}
