import type { NodeSummary } from '@nimbo/contracts';
import { AlertCircle, ChevronRight, FolderOpen, Loader2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { folderPath } from '../routes';

import {
  DisclosureSpacer,
  FileRow,
  FolderRow,
  rowIdOf,
  TREE_CELL_CLASS,
  treeLevelStyle,
  type FolderToggle,
} from './node-rows';
import { SortableHeader, type TableSorting } from './sortable-header';

type FolderNode = Extract<NodeSummary, { type: 'folder' }>;

/**
 * Contenido de una carpeta desglosada, listo para pintar (carpetas primero, 006 CA-26). `hasMore`: la carpeta tiene más
 * de una página; el resto se ve en su página («Ver más», Q-2).
 */
export type DisclosedLevel =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly nodes: readonly NodeSummary[];
      readonly hasMore: boolean;
    };

/** Desglose de carpetas en la lista (006 CA-26); sin él, las carpetas solo se abren. */
export interface FolderDisclosure {
  /** `undefined` si la carpeta está contraída. */
  readonly levelOf: (folderId: string) => DisclosedLevel | undefined;
  readonly toggle: (folderId: string) => void;
  readonly retry: (folderId: string) => void;
}

export interface NodeTableProps {
  readonly nodes: readonly NodeSummary[];
  /** Dónde está el usuario («Mis archivos» o la carpeta abierta), para el título de la tabla. */
  readonly placeName: string;
  readonly renderRowActions: ((node: NodeSummary) => React.ReactNode) | undefined;
  readonly disclosure?: FolderDisclosure | undefined;
  /** Sin él los encabezados son texto (sin botones ni `aria-sort`, 007). */
  readonly sorting?: TableSorting | undefined;
}

/** Lo que cada fila necesita de la tabla, en cualquier nivel. */
interface RowsContext {
  readonly renderRowActions: NodeTableProps['renderRowActions'];
  readonly disclosure: FolderDisclosure | undefined;
}

/** Carpetas y archivos de una ubicación, en el orden de la API (carpetas primero, CA-5), con sus desgloses. */
export function NodeTable({
  nodes,
  placeName,
  renderRowActions,
  disclosure,
  sorting,
}: NodeTableProps): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{`Carpetas y archivos en ${placeName}`}</caption>
        <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <tr>
            <SortableHeader column="name" className="px-4 py-2" sorting={sorting} />
            <SortableHeader
              column="size"
              className="hidden w-24 px-2 py-2 text-right sm:table-cell"
              sorting={sorting}
            />
            <SortableHeader
              column="updated"
              className="hidden w-32 px-2 py-2 sm:table-cell"
              sorting={sorting}
            />
            <th scope="col" className="w-14 px-2 py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <NodeRows nodes={nodes} depth={0} context={{ renderRowActions, disclosure }} />
        </tbody>
      </table>
    </div>
  );
}

interface LevelProps {
  readonly depth: number;
  readonly context: RowsContext;
}

/** Filas de un nivel; `parent` es la carpeta desglosada que las muestra (ninguna en la ubicación abierta). */
function NodeRows({
  nodes,
  parent,
  ...level
}: LevelProps & {
  readonly nodes: readonly NodeSummary[];
  readonly parent?: FolderNode;
}): React.JSX.Element {
  const { depth, context } = level;
  return (
    <>
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <FolderBranch key={node.id} folder={node} parentName={parent?.name} {...level} />
        ) : (
          <FileRow
            key={node.id}
            node={node}
            depth={depth}
            actions={context.renderRowActions?.(node)}
            parentName={parent?.name}
            besideToggles={context.disclosure !== undefined}
          />
        ),
      )}
    </>
  );
}

const noteRowIdOf = (folderId: string): string => `fila-aviso-${folderId}`;
const moreRowIdOf = (folderId: string): string => `fila-ver-mas-${folderId}`;

/**
 * Filas que muestra una carpeta desglosada: las de su contenido (y su «Ver más») o la de su aviso (cargando, vacía o
 * error).
 */
function controlledRows(folderId: string, level: DisclosedLevel | undefined): readonly string[] {
  if (level === undefined) return [];
  if (level.status !== 'ready' || level.nodes.length === 0) return [noteRowIdOf(folderId)];
  const rows = level.nodes.map((node) => rowIdOf(node.id));
  return level.hasMore ? [...rows, moreRowIdOf(folderId)] : rows;
}

function toggleOf(
  folderId: string,
  disclosure: FolderDisclosure | undefined,
): FolderToggle | undefined {
  if (disclosure === undefined) return undefined;
  const level = disclosure.levelOf(folderId);
  return {
    expanded: level !== undefined,
    loading: level?.status === 'loading',
    controls: controlledRows(folderId, level),
    onToggle: () => disclosure.toggle(folderId),
  };
}

/** La fila de la carpeta y, si está desglosada, su contenido un nivel más adentro. */
function FolderBranch({
  folder,
  parentName,
  depth,
  context,
}: LevelProps & {
  readonly folder: FolderNode;
  readonly parentName: string | undefined;
}): React.JSX.Element {
  const level = context.disclosure?.levelOf(folder.id);
  return (
    <>
      <FolderRow
        node={folder}
        depth={depth}
        actions={context.renderRowActions?.(folder)}
        parentName={parentName}
        toggle={toggleOf(folder.id, context.disclosure)}
      />
      {level === undefined ? null : (
        <DisclosedRows level={level} folder={folder} depth={depth + 1} context={context} />
      )}
    </>
  );
}

function DisclosedRows({
  level,
  folder,
  depth,
  context,
}: LevelProps & {
  readonly level: DisclosedLevel;
  readonly folder: FolderNode;
}): React.JSX.Element {
  const noteId = noteRowIdOf(folder.id);
  if (level.status === 'loading')
    return <LevelLoading id={noteId} name={folder.name} depth={depth} />;
  if (level.status === 'error') {
    return (
      <LevelNoteRow id={noteId} depth={depth}>
        <LevelError name={folder.name} onRetry={() => context.disclosure?.retry(folder.id)} />
      </LevelNoteRow>
    );
  }
  if (level.nodes.length === 0) {
    return (
      <LevelNoteRow id={noteId} depth={depth}>
        <FolderOpen className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
        <span>Esta carpeta está vacía</span>
      </LevelNoteRow>
    );
  }
  return (
    <>
      <NodeRows nodes={level.nodes} parent={folder} depth={depth} context={context} />
      {level.hasMore ? <LevelMoreRow folder={folder} depth={depth} /> : null}
    </>
  );
}

/** Al final de un nivel con más de una página: lleva a la página de la carpeta, sin «Cargar más» (Q-2). */
function LevelMoreRow({
  folder,
  depth,
}: {
  readonly folder: FolderNode;
  readonly depth: number;
}): React.JSX.Element {
  return (
    <LevelNoteRow id={moreRowIdOf(folder.id)} depth={depth}>
      <Link
        href={folderPath(folder.id)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-semibold text-primary hover:bg-muted hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
      >
        <span>
          Ver más<span className="sr-only">{` en ${folder.name}`}</span>
        </span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </LevelNoteRow>
  );
}

/**
 * Fila de estado dentro de una carpeta desglosada (cargando, vacía, error o «Ver más»), alineada con los íconos de su
 * nivel: la sangría va en un contenedor y el contenido salta el ancho del control de desglose (`ui-guidelines.md` §3).
 */
function LevelNoteRow({
  id,
  depth,
  children,
}: {
  readonly id: string;
  readonly depth: number;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <tr id={id} className="h-12" style={treeLevelStyle(depth)}>
      <td colSpan={4} className={TREE_CELL_CLASS}>
        <div className="tree-indent">
          <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 pl-9 text-sm text-secondary-foreground sm:min-h-8 sm:pl-11">
            {children}
          </div>
        </div>
      </td>
    </tr>
  );
}

/** Anchos de las líneas de esqueleto bajo «Cargando…» (mockup `explorador--desglosando-cargando`). */
const SKELETON_WIDTHS = ['w-1/2', 'w-2/5'] as const;

function LevelLoading({
  id,
  name,
  depth,
}: {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
}): React.JSX.Element {
  return (
    <>
      <LevelNoteRow id={id} depth={depth}>
        <span role="status" className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {`Cargando el contenido de ${name}…`}
        </span>
      </LevelNoteRow>
      {SKELETON_WIDTHS.map((width) => (
        <tr key={width} aria-hidden="true" className="h-12" style={treeLevelStyle(depth)}>
          <td colSpan={4} className={TREE_CELL_CLASS}>
            <span className="tree-indent flex items-center gap-3">
              <DisclosureSpacer />
              <span className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-muted" />
              <span className={cn('h-3 animate-pulse rounded-md bg-muted', width)} />
            </span>
          </td>
        </tr>
      ))}
    </>
  );
}

function LevelError({
  name,
  onRetry,
}: {
  readonly name: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const messageId = React.useId();
  return (
    <>
      <span
        id={messageId}
        role="alert"
        className="flex min-w-0 flex-1 items-center gap-3 text-foreground"
      >
        <AlertCircle className="h-4.5 w-4.5 shrink-0 text-destructive" aria-hidden="true" />
        <span>{`No pudimos cargar el contenido de ${name}.`}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 sm:h-9"
        aria-describedby={messageId}
        onClick={onRetry}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Reintentar
      </Button>
    </>
  );
}
