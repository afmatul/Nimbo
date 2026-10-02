'use client';

import {
  formatBytes,
  type DownloadUrlResponse,
  type FileSummary,
  type FolderRef,
  type FolderSummary,
  type NodeSummary,
} from '@nimbo/contracts';
import * as React from 'react';

import type { StorageApi } from '../api';
import type { DownloadNotice, PinToggle } from '../components/file-row-menu';
import type { FolderDisclosure } from '../components/node-table';
import { useQuickAccessSidebar } from '../components/quick-access-sidebar';
import { useSpace, type SpaceSummaryState } from '../components/space-provider';
import { locationOf, withArrivals, withOrganized, type OrganizedNodes } from '../organized-nodes';

import {
  useFolderContents,
  type FolderListing,
  type LoadFolderContents,
} from './use-folder-contents';
import {
  toFolderDisclosure,
  useFolderDisclosure,
  type FolderDisclosureState,
} from './use-folder-disclosure';
import { useMoveToTrash } from './use-move-to-trash';
import { useTrashCount } from './use-trash-count';
import { useUploads } from './use-upload-manager';

/** Elemento con «Renombrar» o «Mover a…» abierto (006 CA-4, CA-7). */
export interface Organizing {
  readonly action: 'rename' | 'move';
  readonly node: NodeSummary;
}

/** Lo que necesita el menú ⋮ de cada fila. */
export interface RowActionHandlers {
  readonly requestUrl: (fileId: string) => Promise<DownloadUrlResponse>;
  readonly onNotice: (notice: DownloadNotice | null) => void;
  readonly onRefresh: () => void;
  readonly organize: (organizing: Organizing) => void;
  readonly moveToTrash: (node: NodeSummary) => Promise<void>;
  readonly pinToggleFor: (node: NodeSummary) => PinToggle;
}

/** Migas y contenido visible de una ubicación. */
export interface Level {
  readonly breadcrumbs: readonly FolderRef[];
  readonly nodes: readonly NodeSummary[];
}

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

function readyContents(listing: FolderListing): {
  readonly breadcrumbs: readonly FolderRef[];
  readonly items: readonly NodeSummary[];
} {
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

export function folderNamesOf(nodes: readonly NodeSummary[]): readonly string[] {
  return nodes.flatMap((node) => (node.type === 'folder' ? [node.name] : []));
}

/** `{máximo}` de los estados vacío y arrastre: el del plan según el resumen; sin resumen, el texto lo omite (CA-6). */
export function maxFileLabelOf(state: SpaceSummaryState): string | undefined {
  return state.status === 'ready' ? formatBytes(state.summary.maxFileBytes) : undefined;
}

/**
 * Barra lateral: accesos rápidos, contador de la Papelera y resumen de espacio. Mandar algo a la papelera relee los
 * tres (006 CA-12, CA-27; 007 CA-4).
 */
function useSidebar(
  api: StorageApi,
  folderId: string | null,
  onNotice: (notice: DownloadNotice | null) => void,
) {
  const quickAccessSidebar = useQuickAccessSidebar({ api, openedFolderId: folderId, onNotice });
  const { count, refresh: refreshTrashCount } = useTrashCount(api);
  const { state, refresh: refreshSpace } = useSpace();
  const reloadQuickAccess = quickAccessSidebar.quickAccess.reload;
  const onMovedToTrash = React.useCallback(() => {
    refreshTrashCount();
    refreshSpace();
    reloadQuickAccess();
  }, [refreshTrashCount, refreshSpace, reloadQuickAccess]);
  return { ...quickAccessSidebar, trashCount: count, space: state, onMovedToTrash };
}

/** Aviso de descarga o de papelera sobre la lista; «Actualizar» lo cierra y relee el listado. */
function useNotice(reload: () => void): {
  readonly notice: DownloadNotice | null;
  readonly setNotice: (notice: DownloadNotice | null) => void;
  readonly refresh: () => void;
} {
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const refresh = React.useCallback(() => {
    setNotice(null);
    reload();
  }, [reload]);
  return { notice, setNotice, refresh };
}

interface OrganizingOptions {
  readonly folderId: string | null;
  readonly addFolder: (folder: FolderSummary) => void;
  readonly reviseUploaded: (file: FileSummary) => void;
  /** La barra vuelve a leer el nombre de lo renombrado o movido (CA-27). */
  readonly reloadQuickAccess: () => void;
}

/** «Renombrar» y «Mover a…»: el diálogo abierto y lo ya organizado en esta pestaña (006 CA-4, CA-7). */
function useOrganizing({
  folderId,
  addFolder,
  reviseUploaded,
  reloadQuickAccess,
}: OrganizingOptions) {
  const [organizing, setOrganizing] = React.useState<Organizing | null>(null);
  const [organized, setOrganized] = React.useState<OrganizedNodes>(() => new Map());
  const remember = React.useCallback(
    (node: NodeSummary) => {
      setOrganized((previous) => new Map(previous).set(node.id, node));
      if (node.type === 'file') reviseUploaded(node);
      reloadQuickAccess();
    },
    [reviseUploaded, reloadQuickAccess],
  );
  const folderCreatedFromMove = React.useCallback(
    (folder: FolderSummary) => {
      if (folder.parentId === folderId) addFolder(folder);
      remember({ type: 'folder', ...folder });
    },
    [addFolder, folderId, remember],
  );
  return { organizing, setOrganizing, organized, remember, folderCreatedFromMove };
}

/**
 * Listado paginado de la ubicación y desglose de sus carpetas, con la misma lectura de `GET /folders/contents`.
 * `reloadAll` relee ambos («Actualizar lista», 006 CA-26).
 */
function useListing(api: StorageApi, folderId: string | null) {
  const load = React.useCallback<LoadFolderContents>(
    (id, page) => api.folderContents(id, page),
    [api],
  );
  const contents = useFolderContents(load, folderId);
  const disclosed = useFolderDisclosure(load);
  const { reload } = contents;
  const { refreshAll } = disclosed;
  const reloadAll = React.useCallback(() => {
    reload();
    refreshAll();
  }, [reload, refreshAll]);
  return { load, contents, disclosed, reloadAll };
}

interface VisibleSources {
  readonly folderId: string | null;
  readonly listing: FolderListing;
  readonly disclosed: FolderDisclosureState;
  readonly changes: LocalChanges;
}

/** Lo que se ve: migas, elementos de la ubicación y de cada carpeta desglosada, sin lo mandado a la papelera. */
function visibleOf({ folderId, listing, disclosed, changes }: VisibleSources): Level & {
  readonly disclosure: FolderDisclosure;
  /** Nivel de un elemento, para los diálogos de «Renombrar» y «Mover a…». */
  readonly levelOf: (node: NodeSummary) => Level;
} {
  const { breadcrumbs, items } = readyContents(listing);
  const nodes = visibleAt(changes, folderId, items);
  return {
    breadcrumbs,
    nodes,
    disclosure: toFolderDisclosure(disclosed, (id, contents) =>
      visibleAt(changes, id, contents.items),
    ),
    levelOf: (node) =>
      levelOfNode(node, { folderId, breadcrumbs, nodes }, { state: disclosed, changes }),
  };
}

interface RowActionSources {
  readonly sidebar: ReturnType<typeof useSidebar>;
  readonly notices: ReturnType<typeof useNotice>;
  readonly moveToTrash: (node: NodeSummary) => Promise<void>;
  readonly organize: (organizing: Organizing) => void;
}

function rowActionsOf({
  sidebar,
  notices,
  moveToTrash,
  organize,
}: RowActionSources): RowActionHandlers {
  return {
    requestUrl: sidebar.requestUrl,
    onNotice: notices.setNotice,
    onRefresh: notices.refresh,
    organize,
    moveToTrash,
    pinToggleFor: sidebar.pinToggleFor,
  };
}

export interface MyFilesState {
  readonly folderId: string | null;
  readonly load: LoadFolderContents;
  readonly uploads: ReturnType<typeof useUploads>;
  readonly contents: ReturnType<typeof useFolderContents>;
  readonly sidebar: ReturnType<typeof useSidebar>;
  readonly organize: ReturnType<typeof useOrganizing>;
  readonly view: ReturnType<typeof visibleOf>;
  readonly notices: ReturnType<typeof useNotice>;
  readonly creating: { readonly open: boolean; readonly setOpen: (open: boolean) => void };
  readonly rowActions: RowActionHandlers;
}

/** «Mover a la papelera» con sus avisos; si sale bien, relee la barra lateral. */
function useTrashing(
  api: StorageApi,
  sidebar: ReturnType<typeof useSidebar>,
  notices: ReturnType<typeof useNotice>,
) {
  return useMoveToTrash({
    api,
    onMoved: sidebar.onMovedToTrash,
    onNotice: notices.setNotice,
    onRefresh: notices.refresh,
  });
}

/**
 * Estado de Mis archivos y de cada carpeta: listado paginado, ordenable y desglosable, cargas, avisos, barra lateral,
 * papelera y organizar. Si el listado falla, «Subir archivos» sigue habilitado y el panel de cargas no se entera.
 */
export function useMyFilesState(folderId: string | null): MyFilesState {
  const uploads = useUploads();
  const { load, contents, disclosed, reloadAll } = useListing(uploads.api, folderId);
  const notices = useNotice(reloadAll);
  const sidebar = useSidebar(uploads.api, folderId, notices.setNotice);
  const { trashedIds, moveToTrash } = useTrashing(uploads.api, sidebar, notices);
  const organize = useOrganizing({
    folderId,
    addFolder: contents.addFolder,
    reviseUploaded: uploads.reviseUploaded,
    reloadQuickAccess: sidebar.quickAccess.reload,
  });
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const changes = { uploaded: uploads.uploadedFiles, organized: organize.organized, trashedIds };
  return {
    folderId,
    load,
    uploads,
    contents,
    sidebar,
    organize,
    view: visibleOf({ folderId, listing: contents.listing, disclosed, changes }),
    notices,
    creating: { open: creatingFolder, setOpen: setCreatingFolder },
    rowActions: rowActionsOf({ sidebar, notices, moveToTrash, organize: organize.setOrganizing }),
  };
}
