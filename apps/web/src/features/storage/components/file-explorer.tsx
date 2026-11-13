'use client';

import type { FileSummary, FolderRef, NodeAccessLevel, NodeSummary } from '@nimbo/contracts';
import { FolderPlus, Upload } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import type { ListControls } from '../hooks/use-folder-contents';
import type { NodeSelection } from '../hooks/use-node-selection';
import { isOwner } from '../node-access';
import { orderLabel } from '../node-order';
import { MY_FILES_LABEL } from '../routes';

import { AskAgentButton } from './ask-agent-button';
import { ExplorerErrorState } from './explorer-error-state';
import { FolderBackLink, SHARED_ROOT_CRUMB } from './folder-breadcrumbs';
import { LoadMore } from './load-more';
import { NodeCards } from './node-cards';
import { NodeOrderSelect } from './node-order-select';
import { NodeTable, type FolderDisclosure, type NodeTableProps } from './node-table';
import { ReadOnlyUploadFeedback, useReadOnlyUploads } from './read-only-notice';
import { UploadDropzone } from './upload-dropzone';

export type FileExplorerStatus = 'loading' | 'ready' | 'error';

export interface FileExplorerProps {
  readonly status: FileExplorerStatus;
  /** Nivel sobre la ubicación (012 CA-13): sin `OWNER` no hay subir, «Nueva carpeta» ni arrastre (012b CA-6). */
  readonly accessLevel: NodeAccessLevel;
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
  /** Selección múltiple con casillas (mockup p. 12); sin ella la lista no las muestra. */
  readonly selection?: NodeSelection | undefined;
  /** Aviso que va arriba de la lista (fallo de descarga, CA-21 de 005). */
  readonly notice?: React.ReactNode;
  /** Orden y «Cargar más» del listado (007); sin ellos la lista no se ordena ni pagina. */
  readonly controls?: ListControls;
  /** Vista con la que abre la lista; el usuario la cambia con «Tarjetas» / «Lista». Sin valor, la tabla. */
  readonly defaultView?: NodesView;
  /** «Vista rápida» en las tarjetas de archivos previsualizables (017); sin él no hay botón. */
  readonly onQuickLook?: ((file: FileSummary) => void) | undefined;
}

export type NodesView = 'tarjetas' | 'lista';

/** Lo que ambas vistas reciben; `onQuickLook` solo lo usan las tarjetas. */
type ListTable = Omit<NodeTableProps, 'sorting'> & {
  readonly onQuickLook?: ((file: FileSummary) => void) | undefined;
};

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

/** Encabezado del explorador: nombra la sección y recibe el foco al volver si la fila ya no está (017 §6). */
export const EXPLORER_HEADING_ID = 'explorador-titulo';

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

/** «Nueva carpeta» y «Subir archivos»; deshabilitados en solo lectura (spec 010 CA-14). */
function ExplorerActions({
  onNewFolder,
  onUpload,
  disabled,
}: {
  readonly onNewFolder: () => void;
  readonly onUpload: () => void;
  readonly disabled: boolean;
}): React.JSX.Element {
  return (
    <div className="flex w-full gap-2 sm:w-auto">
      <Button
        type="button"
        variant="outline"
        className="flex-1 sm:flex-none"
        onClick={onNewFolder}
        disabled={disabled}
      >
        <FolderPlus className="h-4 w-4" aria-hidden="true" />
        Nueva carpeta
      </Button>
      <Button type="button" className="flex-1 sm:flex-none" onClick={onUpload} disabled={disabled}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        Subir archivos
      </Button>
    </div>
  );
}

/** «Mis archivos» o una carpeta, propia o compartida conmigo (012b CA-6, CA-9). */
export function FileExplorer(props: FileExplorerProps): React.JSX.Element {
  const { folderId, breadcrumbs } = props;
  const owner = isOwner(props.accessLevel);
  const place = placeOf(folderId, breadcrumbs);
  return (
    <section className="flex flex-col gap-4" aria-labelledby={EXPLORER_HEADING_ID}>
      {place.isRoot || breadcrumbs.length === 0 ? null : (
        <FolderBackLink breadcrumbs={breadcrumbs} {...(owner ? {} : { root: SHARED_ROOT_CRUMB })} />
      )}
      {owner ? (
        <OwnExplorer {...props} place={place} />
      ) : (
        <SharedExplorer {...props} place={place} />
      )}
    </section>
  );
}

type PlacedExplorerProps = FileExplorerProps & { readonly place: Place };

/**
 * Lo propio: encabezado con «Nueva carpeta» y «Subir archivos», zona de arrastre que sube a la ubicación abierta (CA-6)
 * y los estados de la spec 006 §6.
 */
function OwnExplorer(props: PlacedExplorerProps): React.JSX.Element {
  const uploads = useReadOnlyUploads(props.onFiles, props.folderId);
  const picker = useFilePicker(props.fileInputRef);
  return (
    <>
      <ExplorerHeader {...props}>
        <ExplorerActions
          onNewFolder={props.onNewFolder}
          onUpload={picker.open}
          disabled={uploads.readOnly}
        />
      </ExplorerHeader>
      <ReadOnlyUploadFeedback readOnly={uploads.readOnly} blockedDrop={uploads.blockedDrop} />
      <UploadDropzone
        destinationName={placeNameOf(props.folderId, props.breadcrumbs)}
        maxFileLabel={props.maxFileLabel}
        onFiles={uploads.onFiles}
        inputRef={picker.inputRef}
      >
        <ExplorerContent {...props} onUpload={picker.open} readOnly={uploads.readOnly} />
      </UploadDropzone>
    </>
  );
}

/** El selector de archivos de la vista (o el que pasa la página) y cómo abrirlo. */
function useFilePicker(external: FileExplorerProps['fileInputRef']): {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly open: () => void;
} {
  const ownInputRef = React.useRef<HTMLInputElement>(null);
  const inputRef = external ?? ownInputRef;
  return { inputRef, open: () => inputRef.current?.click() };
}

/** Lo compartido conmigo como Editor o Lector: sin subir, crear ni arrastrar (012b CA-6); la API vuelve a decidir. */
function SharedExplorer(props: PlacedExplorerProps): React.JSX.Element {
  return (
    <>
      <ExplorerHeader {...props} />
      <div>
        <ExplorerContent {...props} onUpload={() => undefined} readOnly />
      </div>
    </>
  );
}

function ExplorerHeader({
  folderId,
  place,
  status,
  children,
}: PlacedExplorerProps & { readonly children?: React.ReactNode }): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <ExplorerTitle place={place} loading={status === 'loading'} />
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <AskAboutFolder folderId={folderId} place={place} />
        {children}
      </div>
    </header>
  );
}

/** El aviso de arriba y la lista o su estado. */
function ExplorerContent(
  props: PlacedExplorerProps & { readonly onUpload: () => void; readonly readOnly: boolean },
): React.JSX.Element {
  const { notice, place } = props;
  return (
    <>
      {notice ? (
        <div data-testid="explorer-notice" className="mb-4">
          {notice}
        </div>
      ) : null}
      <ExplorerBody
        status={props.status}
        isRoot={place.isRoot}
        placeName={placeNameOf(props.folderId, props.breadcrumbs)}
        nodes={props.nodes}
        maxFileLabel={props.maxFileLabel}
        onRetry={props.onRetry}
        onUpload={props.onUpload}
        renderRowActions={props.renderRowActions}
        disclosure={props.disclosure}
        selection={props.selection}
        controls={props.controls}
        defaultView={props.defaultView}
        onQuickLook={props.onQuickLook}
        readOnly={props.readOnly}
        shared={!isOwner(props.accessLevel)}
      />
    </>
  );
}

/** Ámbito carpeta (020b CA-15) cuando ya se sabe su nombre; la raíz no es una carpeta y el selector tampoco la ofrece. */
function AskAboutFolder({
  folderId,
  place,
}: {
  readonly folderId: string | null;
  readonly place: Place;
}): React.JSX.Element | null {
  if (folderId === null || place.name === undefined) return null;
  return <AskAgentButton scope={{ type: 'folder', id: folderId, name: place.name }} />;
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
      id={EXPLORER_HEADING_ID}
      tabIndex={-1}
      className="min-w-0 truncate rounded-sm text-xl font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  readonly selection: NodeSelection | undefined;
  readonly controls: ListControls | undefined;
  readonly defaultView: NodesView | undefined;
  readonly onQuickLook: ((file: FileSummary) => void) | undefined;
  /** Spec 010 CA-14: la cuenta está en solo lectura. */
  readonly readOnly: boolean;
  /** Carpeta compartida conmigo: el vacío no invita a subir (012b CA-6). */
  readonly shared: boolean;
}

function ExplorerBody(props: ExplorerBodyProps): React.JSX.Element {
  const { status, isRoot, nodes, controls } = props;
  if (status === 'loading') {
    const title = isRoot ? 'Cargando tus archivos…' : 'Cargando el contenido de la carpeta…';
    return <StateView type="loading" headingLevel="h2" title={title} />;
  }
  if (status === 'error') {
    const title = isRoot ? 'No pudimos cargar tus archivos.' : 'No pudimos abrir esta carpeta.';
    return <ExplorerErrorState title={title} onRetry={props.onRetry} />;
  }
  if (nodes.length === 0) return <EmptyExplorer {...props} />;
  const { placeName, renderRowActions, disclosure, selection } = props;
  const onQuickLook = props.onQuickLook;
  const table = { nodes, placeName, renderRowActions, disclosure, selection, onQuickLook };
  return <NodesPane table={table} controls={controls} defaultView={props.defaultView ?? 'lista'} />;
}

/** Última vista elegida, para recordarla entre visitas (solo comodidad del navegador). */
export const VIEW_STORAGE_KEY = 'nimbo:explorador-vista';

function storedViewOr(fallback: NodesView): NodesView {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'tarjetas' || stored === 'lista' ? stored : fallback;
  } catch {
    return fallback;
  }
}

function storeView(view: NodesView): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Sin almacenamiento el explorador sigue funcionando; solo no recuerda la vista.
  }
}

const VIEWS: readonly { readonly id: NodesView; readonly label: string }[] = [
  { id: 'tarjetas', label: 'Tarjetas' },
  { id: 'lista', label: 'Lista' },
];

/** «Tarjetas» / «Lista» (mockup `explorador--cuadricula`); `aria-pressed` marca la vista activa. */
function ViewToggle({
  view,
  onChange,
}: {
  readonly view: NodesView;
  readonly onChange: (view: NodesView) => void;
}): React.JSX.Element {
  return (
    <div role="group" aria-label="Vista" className="flex rounded-md border border-border p-0.5">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          onClick={() => onChange(id)}
          className={cn(
            'min-h-8 rounded px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            view === id
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** El selector de vista y la lista, en tarjetas o en tabla. */
function NodesPane({
  table,
  controls,
  defaultView,
}: {
  readonly table: ListTable;
  readonly controls: ListControls | undefined;
  readonly defaultView: NodesView;
}): React.JSX.Element {
  const [view, changeView] = React.useState<NodesView>(() => storedViewOr(defaultView));
  const setView = (next: NodesView): void => {
    changeView(next);
    storeView(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {controls && view === 'tarjetas' ? (
          <NodeOrderSelect
            order={controls.order}
            busy={controls.sorting}
            onChange={controls.changeOrder}
          />
        ) : (
          <span />
        )}
        <ViewToggle view={view} onChange={setView} />
      </div>
      {controls ? (
        <ControlledList table={table} controls={controls} view={view} />
      ) : (
        <NodeListView table={table} view={view} />
      )}
    </div>
  );
}

function NodeListView({
  table,
  view,
  sorting,
}: {
  readonly table: ListTable;
  readonly view: NodesView;
  readonly sorting?: NodeTableProps['sorting'];
}): React.JSX.Element {
  if (view === 'tarjetas') {
    return (
      <NodeCards
        nodes={table.nodes}
        placeName={table.placeName}
        renderRowActions={table.renderRowActions}
        onQuickLook={table.onQuickLook}
      />
    );
  }
  const { onQuickLook: _unused, ...tableProps } = table;
  return <NodeTable {...tableProps} sorting={sorting} />;
}

/**
 * «Cargar más» debajo; el orden se pide desde los encabezados de la tabla (007). Mientras llega otro orden la lista visible se conserva con
 * `aria-busy` y la tabla marca el orden de lo que muestra, no el pedido (CA-12).
 */
interface ControlledListProps {
  readonly table: ListTable;
  readonly controls: ListControls;
  readonly view: NodesView;
}

function ControlledList({ table, controls, view }: ControlledListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {controls.sorting ? `Ordenando por ${orderLabel(controls.order).toLowerCase()}…` : ''}
      </p>
      <div aria-busy={controls.sorting || undefined}>
        <NodeListView
          table={table}
          view={view}
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

/** Spec 010 CA-14: en solo lectura el vacío no invita a subir ni ofrece el botón (la carga está bloqueada). */
const READ_ONLY_EMPTY_TEXT = 'Cuando renueves tu plan podrás subir documentos aquí.';

/** 012b CA-6: una carpeta compartida conmigo vacía; solo su propietario sube. */
const SHARED_EMPTY_TEXT = 'Cuando quien la compartió agregue archivos, aparecerán aquí.';

/** Spec 010 CA-14: el vacío en solo lectura, sin el botón ni la invitación a subir. */
function ReadOnlyEmpty({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}): React.JSX.Element {
  return <StateView type="empty" headingLevel="h2" title={title} description={description} />;
}

function EmptyExplorer({
  isRoot,
  maxFileLabel,
  readOnly,
  shared,
  onUpload,
}: Pick<
  ExplorerBodyProps,
  'isRoot' | 'maxFileLabel' | 'readOnly' | 'shared' | 'onUpload'
>): React.JSX.Element {
  const canDrag = useCanDragFiles();
  const texts = isRoot ? EMPTY_TEXTS.root : EMPTY_TEXTS.folder;
  if (shared) return <ReadOnlyEmpty title={texts.title} description={SHARED_EMPTY_TEXT} />;
  if (readOnly) return <ReadOnlyEmpty title={texts.title} description={READ_ONLY_EMPTY_TEXT} />;
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
