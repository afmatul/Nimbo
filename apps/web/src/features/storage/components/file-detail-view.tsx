'use client';

import {
  formatBytes,
  type FileVersionSummary,
  type IndexingStatusResponse,
} from '@nimbo/contracts';
import { ChevronLeft, Download, FileX, Folder, History, Info, Undo2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { AppLayout } from '../../../components/nimbo/app-layout';
import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { StateView } from '../../../components/nimbo/state-view';
import { VersionTimeline, versionByline } from '../../../components/nimbo/version-timeline';
import { Button, buttonVariants } from '../../../components/ui/button';
import { showNotice } from '../../../components/ui/sonner';
import { dateTimeLabel } from '../../../lib/format-date';
import { SignOutButton } from '../../identity/components/sign-out-button';
import { useSession } from '../../identity/session/session-provider';
import { IndexingBanner } from '../../intelligence/components/indexing-banner';
import { IndexingStatusChip } from '../../intelligence/components/indexing-status-chip';
import {
  useIndexingStatus,
  type IndexingStatusView,
} from '../../intelligence/hooks/use-indexing-status';
import type { IndexingApi } from '../../intelligence/indexing-api';
import { indexedNotice, indexingDetailOf } from '../../intelligence/indexing-messages';
import { FILE_KIND_LABELS } from '../file-kind-label';
import { useFileVersions, type VersionsListing } from '../hooks/use-file-versions';
import { useTrashCount } from '../hooks/use-trash-count';
import { useUploads } from '../hooks/use-upload-manager';
import { useVersionActions, type VersionActions } from '../hooks/use-version-actions';
import { locationPath, MY_FILES_LABEL, MY_FILES_PATH } from '../routes';
import { historySummary, totalVersionBytes, versionToPrune } from '../version-history';

import { DownloadNoticeBanner, openInBrowser, type DownloadNotice } from './file-row-menu';
import { CHIP_TYPE_BY_KIND } from './node-rows';
import { useQuickAccessSidebar } from './quick-access-sidebar';
import { RestoreVersionDialog, type RestoreTarget } from './restore-version-dialog';
import { SidebarQuota } from './sidebar-quota';
import { useSpace } from './space-provider';

type ReadyListing = Extract<VersionsListing, { status: 'ready' }>;

const HISTORY_TITLE_ID = 'historial-versiones';
/** Título mientras el archivo no llegó (cargando o error). */
const GENERIC_TITLE = 'Versiones del archivo';
const BACK_TO_FOLDER_LABEL = 'Volver a la carpeta';
const OPEN_FOLDER_LABEL = 'Abrir la carpeta';

export interface FileDetailViewProps {
  readonly fileId: string;
  /** Estado de indexación del archivo (019). */
  readonly indexingApi: IndexingApi;
  /** Abre la URL firmada; por omisión, en la pestaña (005 CA-13). */
  readonly openUrl?: (url: string) => void;
}

function currentOf(listing: ReadyListing): FileVersionSummary | undefined {
  return listing.items.find((version) => version.isCurrent);
}

function restoreTargetOf(
  version: FileVersionSummary,
  listing: ReadyListing,
  viewerId: string | null,
): RestoreTarget {
  return {
    version,
    byline: versionByline(version, viewerId, listing.loadedAt),
    currentNumber: currentOf(listing)?.number ?? version.number,
    retainedVersions: listing.retainedVersions,
    prunedNumber: versionToPrune(listing.items, listing.retainedVersions),
  };
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

/**
 * Ficha de un archivo con su historial de versiones (spec 014, mockup `storage/ficha-archivo`, D-10): descargar cualquier
 * versión, restaurar las anteriores con confirmación y los detalles de espacio, con el estado de indexación (019). Sin
 * panel lateral; se llega desde «Ver historial» del menú ⋮.
 */
export function FileDetailView({
  fileId,
  indexingApi,
  openUrl = openInBrowser,
}: FileDetailViewProps): React.JSX.Element {
  const { api } = useUploads();
  const space = useSpace();
  const [sidebarNotice, setSidebarNotice] = React.useState<DownloadNotice | null>(null);
  const sidebar = useQuickAccessSidebar({ api, openedFolderId: null, onNotice: setSidebarNotice });
  const trash = useTrashCount(api);
  const history = useFileVersions(api, fileId);
  const indexing = useFileIndexing(indexingApi, fileId, history.listing);
  const actions = useVersionActions({
    api,
    fileId,
    reload: history.reload,
    onSpaceChanged: space.refresh,
    openUrl,
  });
  return (
    <AppLayout
      sidebarSection={sidebar.sidebarSection}
      trashCount={trash.count}
      quotaCard={<SidebarQuota state={space.state} />}
    >
      <FileDetailContent
        listing={history.listing}
        actions={actions}
        indexing={indexing}
        sidebarNotice={sidebarNotice}
        onDismissSidebarNotice={() => setSidebarNotice(null)}
        onRetry={history.reload}
      />
      <RestoreVersionDialog
        target={actions.restoreTarget}
        onConfirm={actions.confirmRestore}
        onClose={actions.closeRestore}
      />
    </AppLayout>
  );
}

interface FileDetailContentProps {
  readonly listing: VersionsListing;
  readonly actions: VersionActions;
  readonly indexing: IndexingStatusView;
  readonly sidebarNotice: DownloadNotice | null;
  readonly onDismissSidebarNotice: () => void;
  readonly onRetry: () => void;
}

function FileDetailContent(props: FileDetailContentProps): React.JSX.Element {
  const { listing, actions, indexing } = props;
  const ready = listing.status === 'ready' ? listing : null;
  const notice = actions.notice ?? props.sidebarNotice;
  const dismiss = actions.notice ? actions.dismissNotice : props.onDismissSidebarNotice;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SignOutButton />
      </div>
      {listing.status === 'not_found' ? (
        <FileNotFoundState />
      ) : (
        <>
          <BackLink folderId={ready?.file.folderId ?? null} />
          <div>
            <FileHeader ready={ready} actions={actions} indexing={indexing.status} />
            <IndexingBanner status={indexing.status} retry={indexing.retry} />
          </div>
          <HistoryCard listing={listing} actions={actions} onRetry={props.onRetry}>
            {notice ? <DownloadNoticeBanner notice={notice} onDismiss={dismiss} /> : null}
          </HistoryCard>
          {ready ? <DetailsCard listing={ready} indexing={indexing.status} /> : null}
        </>
      )}
    </div>
  );
}

/** Vuelve a donde está el archivo: la raíz o su carpeta (mockup: «‹ {carpeta}»). */
function BackLink({ folderId }: { readonly folderId: string | null }): React.JSX.Element {
  return (
    <Link
      href={locationPath(folderId)}
      className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-secondary-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-6"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {folderId === null ? MY_FILES_LABEL : BACK_TO_FOLDER_LABEL}
    </Link>
  );
}

/** Tipo, nombre (CA-20), versión actual, estado de indexación (019) y «Descargar» de la versión actual. */
function FileHeader({
  ready,
  actions,
  indexing,
}: {
  readonly ready: ReadyListing | null;
  readonly actions: VersionActions;
  readonly indexing: IndexingStatusResponse | null;
}): React.JSX.Element {
  const current = ready ? currentOf(ready) : undefined;
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {ready ? (
          <FileTypeChip fileType={CHIP_TYPE_BY_KIND[ready.file.kind]} className="mt-1 shrink-0" />
        ) : null}
        <div className="min-w-0">
          <FileTitle ready={ready} current={current} />
          <IndexingStatusChip status={indexing} />
        </div>
      </div>
      {current ? (
        <Button
          type="button"
          className="w-full sm:w-auto"
          aria-label="Descargar la versión actual"
          onClick={() => void actions.download(current)}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Descargar
        </Button>
      ) : null}
    </header>
  );
}

function FileTitle({
  ready,
  current,
}: {
  readonly ready: ReadyListing | null;
  readonly current: FileVersionSummary | undefined;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <h1 className="wrap-anywhere text-xl font-semibold tracking-tight text-foreground">
        {ready?.file.name ?? GENERIC_TITLE}
      </h1>
      {current ? (
        <p className="text-sm tabular-nums text-secondary-foreground">
          {`${formatBytes(current.sizeBytes)} · versión ${String(current.number)}`}
        </p>
      ) : null}
    </div>
  );
}

interface HistoryCardProps {
  readonly listing: VersionsListing;
  readonly actions: VersionActions;
  readonly onRetry: () => void;
  /** Aviso arriba de la lista. */
  readonly children: React.ReactNode;
}

function HistoryCard({ listing, actions, onRetry, children }: HistoryCardProps): React.JSX.Element {
  const planName = usePlanName();
  return (
    <section
      aria-labelledby={HISTORY_TITLE_ID}
      className="rounded-lg border border-border bg-card shadow-card"
    >
      <div className="px-4 py-4 sm:px-5">
        <h2 id={HISTORY_TITLE_ID} className="text-base font-semibold text-foreground">
          Historial de versiones
        </h2>
        {listing.status === 'ready' ? (
          <p className="text-sm text-secondary-foreground">
            {historySummary(listing.items.length, listing.retainedVersions, planName)}
          </p>
        ) : null}
      </div>
      {children ? <div className="px-4 pb-4 sm:px-5">{children}</div> : null}
      <HistoryBody listing={listing} actions={actions} onRetry={onRetry} />
    </section>
  );
}

function usePlanName(): string | null {
  const { state } = useSpace();
  return state.status === 'ready' ? state.summary.planName : null;
}

function HistoryBody({
  listing,
  actions,
  onRetry,
}: Omit<HistoryCardProps, 'children'>): React.JSX.Element | null {
  if (listing.status === 'loading') {
    return (
      <StateView
        type="loading"
        headingLevel="h3"
        title="Cargando el historial…"
        className="m-4 sm:m-5"
      />
    );
  }
  if (listing.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h3"
        title="No pudimos cargar el historial."
        description="Tus versiones siguen guardadas. Inténtalo de nuevo en unos segundos."
        action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
        className="m-4 sm:m-5"
      />
    );
  }
  return listing.status === 'ready' ? <ReadyHistory listing={listing} actions={actions} /> : null;
}

function ReadyHistory({
  listing,
  actions,
}: {
  readonly listing: ReadyListing;
  readonly actions: VersionActions;
}): React.JSX.Element {
  const viewerId = useSession().user?.id ?? null;
  return (
    <>
      <VersionTimeline
        labelledBy={HISTORY_TITLE_ID}
        versions={listing.items}
        viewerId={viewerId}
        now={listing.loadedAt}
        highlightedId={actions.highlightedId}
        renderActions={(version) => (
          <VersionButtons
            version={version}
            actions={actions}
            onRestore={() => actions.openRestore(restoreTargetOf(version, listing, viewerId))}
          />
        )}
      />
      {listing.items.length === 1 ? <NoPreviousVersions /> : <RestoreNote />}
    </>
  );
}

const ACTION_CLASS = 'h-11 flex-1 sm:h-9 sm:flex-none';

/** «Descargar» en todas; «Restaurar» en todas salvo la actual (CA-20). */
function VersionButtons({
  version,
  actions,
  onRestore,
}: {
  readonly version: FileVersionSummary;
  readonly actions: VersionActions;
  readonly onRestore: () => void;
}): React.JSX.Element {
  const number = String(version.number);
  const preparing = actions.preparingId === version.id;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={ACTION_CLASS}
        aria-label={`Descargar la versión ${number}`}
        aria-disabled={preparing || undefined}
        onClick={() => void actions.download(version)}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {preparing ? 'Preparando…' : 'Descargar'}
      </Button>
      {version.isCurrent ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ACTION_CLASS}
          aria-label={`Restaurar la versión ${number}`}
          onClick={onRestore}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Restaurar
        </Button>
      )}
      <span role="status" className="sr-only">
        {preparing ? `Preparando la descarga de la versión ${number}…` : ''}
      </span>
    </>
  );
}

function RestoreNote(): React.JSX.Element {
  return (
    <p className="flex items-start gap-2 border-t border-border px-4 py-3 text-sm text-secondary-foreground sm:px-5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      Restaurar crea una versión nueva; solo se elimina la más antigua cuando pasas el límite de tu
      plan.
    </p>
  );
}

/** Una sola versión (CA-20): cómo nacen las demás. */
function NoPreviousVersions(): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 border-t border-dashed border-border px-4 py-4 text-sm sm:px-5">
      <History className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-semibold text-foreground">Aún no hay versiones anteriores.</p>
        <p className="text-secondary-foreground">
          Cuando subas un archivo con el mismo nombre y elijas «Reemplazar», o restaures una
          versión, aquí verás el historial.
        </p>
      </div>
    </div>
  );
}

/** «Mis archivos» en la raíz; si no, enlace a la carpeta (la API da su id, no su nombre). */
function LocationLink({ folderId }: { readonly folderId: string | null }): React.JSX.Element {
  return (
    <Link
      href={locationPath(folderId)}
      className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {folderId === null ? MY_FILES_LABEL : OPEN_FOLDER_LABEL}
    </Link>
  );
}

/**
 * Tipo y ubicación (CA-20), tamaño de la actual, espacio de todas las versiones (D-1: todas cuentan), cuándo cambió
 * por última vez y, si el tipo se indexa, cuándo y de qué versión (019, RN-1).
 */
function DetailsCard({
  listing,
  indexing,
}: {
  readonly listing: ReadyListing;
  readonly indexing: IndexingStatusResponse | null;
}): React.JSX.Element {
  const current = currentOf(listing);
  const { file } = listing;
  const indexingDetail =
    indexing && current ? indexingDetailOf(indexing, current.number, listing.loadedAt) : null;
  const rows: readonly (readonly [string, React.ReactNode])[] = [
    ['Tipo', FILE_KIND_LABELS[file.kind]],
    ['Tamaño', current ? `${formatBytes(current.sizeBytes)} (versión actual)` : '—'],
    ['Con versiones', `${formatBytes(totalVersionBytes(listing.items))} de tu espacio`],
    ['Ubicación', <LocationLink key="ubicacion" folderId={file.folderId} />],
    ['Modificado', current ? dateTimeLabel(current.createdAt, listing.loadedAt) : '—'],
    ...(indexingDetail === null ? [] : [['Indexación', indexingDetail] as const]),
  ];
  return (
    <section
      aria-labelledby="detalles-archivo"
      className="rounded-lg border border-border bg-card shadow-card"
    >
      <h2
        id="detalles-archivo"
        className="border-b border-border px-4 py-4 text-base font-semibold text-foreground sm:px-5"
      >
        Detalles
      </h2>
      <dl className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-3 sm:px-5">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt className="text-secondary-foreground">{term}</dt>
            <dd className="tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Archivo en la papelera, inexistente o ajeno (CA-16, CA-17): el mismo texto para todos, para no revelar cuál es. */
function FileNotFoundState(): React.JSX.Element {
  return (
    <section
      aria-labelledby="archivo-no-encontrado"
      className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm"
    >
      <FileX className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 id="archivo-no-encontrado" className="text-lg font-semibold text-foreground">
        No encontramos este archivo.
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Puede que lo hayas movido a la papelera o que ya no exista.
      </p>
      <Link href={MY_FILES_PATH} className={buttonVariants({ className: 'mt-5' })}>
        <Folder className="h-4 w-4" aria-hidden="true" />
        Ir a Mis archivos
      </Link>
    </section>
  );
}
