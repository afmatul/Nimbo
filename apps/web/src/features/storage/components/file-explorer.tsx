'use client';

import { STORAGE_ERROR_CODES } from '@nimbo/contracts';
import type { FolderRef, NodeSummary } from '@nimbo/contracts';
import { FolderPlus, Upload } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { messageForCode } from '../../../lib/error-catalog';
import type { ListControls } from '../hooks/use-folder-contents';
import { MY_FILES_LABEL } from '../routes';

import { ExplorerErrorState } from './explorer-error-state';
import { FolderBackLink } from './folder-breadcrumbs';
import { LoadMore } from './load-more';
import { NodeSortMenu } from './node-sort-menu';
import { NodeTable, type FolderDisclosure, type NodeTableProps } from './node-table';
import { READ_ONLY_ACTIONS_HINT } from './read-only-notice';
import { useReadOnlyAccount } from './space-provider';
import { UploadDropzone } from './upload-dropzone';

export type FileExplorerStatus = 'loading' | 'ready' | 'error';

export interface FileExplorerProps {
  readonly status: FileExplorerStatus;
  /** Carpeta abierta; `null` es la raíz («Mis archivos»). */
  readonly folderId: string | null;
  /** Migas de `GET /folders/contents` (la última es la carpeta abierta); vacías mientras no llegan. */
  readonly breadcrumbs: readonly FolderRef[];
  /** Contenido directo de la ubicación, carpetas primero (CA-5). */
  readonly nodes: readonly NodeSummary[];
  /**
   * Máximo por archivo ya formateado; viene de `PlanLimits` por la API, nunca del código (RN-1). Sin él (aún no hay
   * contrato que lo exponga a `web`) los textos omiten la cifra.
   */
  readonly maxFileLabel?: string | undefined;
  readonly onFiles: (files: readonly File[]) => void;
  readonly onRetry: () => void;
  readonly onNewFolder: () => void;
  /** Selector de archivos de la vista, para que otro control (p. ej. «Subir de nuevo» del panel) lo abra. */
  readonly fileInputRef?: React.RefObject<HTMLInputElement | null>;
  readonly renderRowActions?: (node: NodeSummary) => React.ReactNode;
  /** Desglose de carpetas en la lista (CA-26); sin él, las carpetas solo se abren. */
  readonly disclosure?: FolderDisclosure | undefined;
  /** Aviso que va arriba de la lista (fallo de descarga, CA-21 de 005). */
  readonly notice?: React.ReactNode;
  /** Orden y «Cargar más» del listado (007); sin ellos la lista no se ordena ni pagina. */
  readonly controls?: ListControls;
}

const UNKNOWN_FOLDER_TITLE = 'Carpeta';
const UNKNOWN_FOLDER_PLACE = 'esta carpeta';

/** Lo que el explorador sabe de dónde está: el nombre falta mientras carga una carpeta (o si falló). */
interface Place {
  readonly isRoot: boolean;
  readonly name: string | undefined;
}

function placeOf(folderId: string | null, breadcrumbs: readonly FolderRef[]): Place {
  if (folderId === null) return { isRoot: true, name: MY_FILES_LABEL };
  return { isRoot: false, name: breadcrumbs.at(-1)?.name };
}

/** Nombre de la ubicación para los textos («Se guardarán en…», «Se creará en…»); «esta carpeta» si aún no se sabe. */
export function placeNameOf(folderId: string | null, breadcrumbs: readonly FolderRef[]): string {
  return placeOf(folderId, breadcrumbs).name ?? UNKNOWN_FOLDER_PLACE;
}

/** Pantallas táctiles sin arrastre: la descripción del vacío no menciona arrastrar (mockup `explorador--vacio`). */
const NO_DRAG_QUERY = '(hover: none), (pointer: coarse)';

function subscribeToDragSupport(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(NO_DRAG_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function canDragNow(): boolean {
  return typeof window.matchMedia !== 'function' || !window.matchMedia(NO_DRAG_QUERY).matches;
}

function useCanDragFiles(): boolean {
  return React.useSyncExternalStore(subscribeToDragSupport, canDragNow, () => true);
}

/**
 * «Mis archivos» o una carpeta: encabezado con «Nueva carpeta» y «Subir archivos», zona de arrastre que sube a la
 * ubicación abierta (CA-6) y los estados de la spec 006 §6.
 */
export function FileExplorer({
  status,
  folderId,
  breadcrumbs,
  nodes,
  maxFileLabel,
  onFiles,
  onRetry,
  onNewFolder,
  fileInputRef,
  renderRowActions,
  disclosure,
  notice,
  controls,
}: FileExplorerProps): React.JSX.Element {
  const { readOnly } = useReadOnlyAccount();
  const [blockedDrop, setBlockedDrop] = React.useState(false);
  const ownInputRef = React.useRef<HTMLInputElement>(null);
  const inputRef = fileInputRef ?? ownInputRef;
  const openPicker = (): void => inputRef.current?.click();
  const place = placeOf(folderId, breadcrumbs);
  const placeName = placeNameOf(folderId, breadcrumbs);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="explorador-titulo">
      {place.isRoot || breadcrumbs.length === 0 ? null : (
        <FolderBackLink breadcrumbs={breadcrumbs} />
      )}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <ExplorerTitle place={place} loading={status === 'loading'} />
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={onNewFolder}
            disabled={readOnly}
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            Nueva carpeta
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            onClick={openPicker}
            disabled={readOnly}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Subir archivos
          </Button>
        </div>
      </header>
      {readOnly ? (
        <p className="text-sm text-secondary-foreground">{READ_ONLY_ACTIONS_HINT}</p>
      ) : null}
      {blockedDrop ? (
        <Alert variant="error">
          {messageForCode(STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY)}
        </Alert>
      ) : null}

      <UploadDropzone
        destinationName={placeName}
        maxFileLabel={maxFileLabel}
        onFiles={readOnly ? () => setBlockedDrop(true) : onFiles}
        inputRef={inputRef}
      >
        {notice ? (
          <div data-testid="explorer-notice" className="mb-4">
            {notice}
          </div>
        ) : null}
        <ExplorerBody
          status={status}
          isRoot={place.isRoot}
          placeName={placeName}
          nodes={nodes}
          maxFileLabel={maxFileLabel}
          onRetry={onRetry}
          onUpload={openPicker}
          renderRowActions={renderRowActions}
          disclosure={disclosure}
          controls={controls}
        />
      </UploadDropzone>
    </section>
  );
}

/** El nombre de la carpeta llega con el listado: mientras tanto, una línea de esqueleto anunciada como «Cargando carpeta». */
function ExplorerTitle({
  place,
  loading,
}: {
  readonly place: Place;
  readonly loading: boolean;
}): React.JSX.Element {
  const unknownWhileLoading = place.name === undefined && loading;
  return (
    <h1
      id="explorador-titulo"
      className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground"
    >
      {unknownWhileLoading ? (
        <>
          <span className="sr-only">Cargando carpeta</span>
          <span aria-hidden="true" className="block h-6 w-48 animate-pulse rounded-md bg-muted" />
        </>
      ) : (
        (place.name ?? UNKNOWN_FOLDER_TITLE)
      )}
    </h1>
  );
}

interface ExplorerBodyProps {
  readonly status: FileExplorerStatus;
  readonly isRoot: boolean;
  readonly placeName: string;
  readonly nodes: readonly NodeSummary[];
  readonly maxFileLabel: string | undefined;
  readonly onRetry: () => void;
  readonly onUpload: () => void;
  readonly renderRowActions: FileExplorerProps['renderRowActions'] | undefined;
  readonly disclosure: FolderDisclosure | undefined;
  readonly controls: ListControls | undefined;
}

function ExplorerBody({
  status,
  isRoot,
  placeName,
  nodes,
  maxFileLabel,
  onRetry,
  onUpload,
  renderRowActions,
  disclosure,
  controls,
}: ExplorerBodyProps): React.JSX.Element {
  if (status === 'loading') {
    const title = isRoot ? 'Cargando tus archivos…' : 'Cargando el contenido de la carpeta…';
    return <StateView type="loading" headingLevel="h2" title={title} />;
  }
  if (status === 'error') {
    const title = isRoot ? 'No pudimos cargar tus archivos.' : 'No pudimos abrir esta carpeta.';
    return <ExplorerErrorState title={title} onRetry={onRetry} />;
  }
  if (nodes.length === 0) {
    return <EmptyExplorer isRoot={isRoot} maxFileLabel={maxFileLabel} onUpload={onUpload} />;
  }
  const table = { nodes, placeName, renderRowActions, disclosure };
  return controls ? <ControlledList table={table} controls={controls} /> : <NodeTable {...table} />;
}

/**
 * «Ordenar» encima y «Cargar más» debajo (007). Mientras llega otro orden la lista visible se conserva con
 * `aria-busy` y la tabla marca el orden de lo que muestra, no el pedido (CA-12).
 */
function ControlledList({
  table,
  controls,
}: {
  readonly table: Omit<NodeTableProps, 'sorting'>;
  readonly controls: ListControls;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <NodeSortMenu
        order={controls.order}
        sorting={controls.sorting}
        onChange={controls.changeOrder}
      />
      <div aria-busy={controls.sorting || undefined}>
        <NodeTable
          {...table}
          sorting={{ order: controls.shownOrder, onSort: controls.changeOrder }}
        />
      </div>
      <LoadMore
        status={controls.more}
        hasMore={controls.hasMore}
        added={controls.added}
        placeName={table.placeName}
        onLoadMore={controls.loadMore}
        onDismissError={controls.dismissMoreError}
      />
    </div>
  );
}

/** Textos del vacío: la raíz es el de 005; una carpeta invita también a crear una subcarpeta (`carpeta-vacia`). */
const EMPTY_TEXTS = {
  root: {
    title: 'Aún no tienes archivos',
    withDrag: 'Sube tus documentos con el botón o arrástralos a esta página.',
    withoutDrag: 'Sube tus documentos desde tu dispositivo.',
  },
  folder: {
    title: 'Esta carpeta está vacía',
    withDrag: 'Sube documentos con el botón o arrástralos aquí, o crea una subcarpeta.',
    withoutDrag: 'Sube documentos desde tu dispositivo o crea una subcarpeta.',
  },
} as const;

function EmptyExplorer({
  isRoot,
  maxFileLabel,
  onUpload,
}: {
  readonly isRoot: boolean;
  readonly maxFileLabel: string | undefined;
  readonly onUpload: () => void;
}): React.JSX.Element {
  const canDrag = useCanDragFiles();
  const texts = isRoot ? EMPTY_TEXTS.root : EMPTY_TEXTS.folder;
  const invitation = canDrag ? texts.withDrag : texts.withoutDrag;
  const limit =
    maxFileLabel === undefined ? '' : ` Tu plan permite hasta ${maxFileLabel} por archivo.`;
  return (
    <StateView
      type="empty"
      headingLevel="h2"
      title={texts.title}
      description={`${invitation}${limit}`}
      action={{ label: 'Subir archivos', onClick: onUpload }}
    />
  );
}
