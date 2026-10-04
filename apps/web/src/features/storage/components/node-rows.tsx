import { formatBytes, type FileKind, type NodeSummary } from '@nimbo/contracts';
import { ChevronRight, Folder, Loader2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { FileTypeChip, type FileType } from '../../../components/nimbo/file-type-chip';
import { cn } from '../../../lib/utils';
import { folderPath } from '../routes';

type FolderNode = Extract<NodeSummary, { type: 'folder' }>;
type FileNode = Extract<NodeSummary, { type: 'file' }>;

export const CHIP_TYPE_BY_KIND: Readonly<Record<FileKind, FileType>> = {
  docx: 'docx',
  pdf: 'pdf',
  xlsx: 'xlsx',
  pptx: 'pptx',
  imagen: 'img',
  texto: 'other',
  otro: 'other',
};

/**
 * Sangría de la celda del nombre por nivel de desglose (0 = la ubicación abierta, 006 CA-26): 28 px por nivel y 16 px
 * en móvil (mockup `explorador--carpeta-desglosada`). Clases literales para que Tailwind las genere; más allá del
 * último nivel se repite.
 */
const NAME_INDENT = [
  'pl-4',
  'pl-8 sm:pl-11',
  'pl-12 sm:pl-18',
  'pl-16 sm:pl-25',
  'pl-20 sm:pl-32',
  'pl-24 sm:pl-39',
  'pl-28 sm:pl-46',
  'pl-32 sm:pl-53',
  'pl-36 sm:pl-60',
  'pl-40 sm:pl-67',
];

export const nameIndent = (depth: number): string =>
  NAME_INDENT[Math.min(depth, NAME_INDENT.length - 1)] ?? '';

/** Identificador de la fila de un elemento, para el `aria-controls` del control de desglose. */
export const rowIdOf = (nodeId: string): string => `fila-${nodeId}`;

const dateFormatter = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' });

function CreatedAt({ value }: { readonly value: string }): React.JSX.Element {
  return <time dateTime={value}>{dateFormatter.format(new Date(value))}</time>;
}

/** Control de desglose de una carpeta (CA-26). */
export interface FolderToggle {
  readonly expanded: boolean;
  readonly loading: boolean;
  /** Filas que muestra al estar desglosada; vacío si está contraída. */
  readonly controls: readonly string[];
  readonly onToggle: () => void;
}

interface RowProps<T> {
  readonly node: T;
  readonly depth: number;
  readonly actions: React.ReactNode;
  /** Carpeta desglosada que muestra la fila, para lectores de pantalla («, dentro de …»). */
  readonly parentName: string | undefined;
}

interface FolderRowProps extends RowProps<FolderNode> {
  /** `undefined` en una lista sin desglose. */
  readonly toggle: FolderToggle | undefined;
}

interface FileRowProps extends RowProps<FileNode> {
  /** La lista tiene desglose: el archivo reserva el lugar del control para alinear su nombre. */
  readonly besideToggles: boolean;
}

function DisclosureButton({
  name,
  toggle,
}: {
  readonly name: string;
  readonly toggle: FolderToggle;
}): React.JSX.Element {
  const controls = toggle.controls.length > 0 ? toggle.controls.join(' ') : undefined;
  return (
    <button
      type="button"
      aria-expanded={toggle.expanded}
      aria-controls={controls}
      aria-busy={toggle.loading || undefined}
      aria-label={`Mostrar contenido de ${name}`}
      onClick={toggle.onToggle}
      className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-0 sm:h-8 sm:w-8"
    >
      {toggle.loading ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <ChevronRight
          className={cn('h-4 w-4 motion-safe:transition-transform', toggle.expanded && 'rotate-90')}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/** Lugar del control de desglose en las filas de archivo, para alinear los nombres con los de las carpetas. */
export function DisclosureSpacer(): React.JSX.Element {
  return <span aria-hidden="true" className="h-11 w-9 shrink-0 sm:h-8 sm:w-8" />;
}

function InsideOf({
  parentName,
}: {
  readonly parentName: string | undefined;
}): React.JSX.Element | null {
  return parentName === undefined ? null : (
    <span className="sr-only">{`, dentro de ${parentName}`}</span>
  );
}

/** Celda del nombre: control de desglose (o su lugar), ícono y texto, con la sangría del nivel. */
function NameCell({
  depth,
  lead,
  children,
}: {
  readonly depth: number;
  readonly lead: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <td className={cn('py-2 pr-4', nameIndent(depth))}>
      <span className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        {lead}
        {children}
      </span>
    </td>
  );
}

/**
 * Abre la carpeta por su nombre (un enlace con URL propia, CA-5); la flecha la desglosa en la lista (CA-26). La fila no
 * es clicable para no competir con el ⋮.
 */
export function FolderRow({
  node: folder,
  depth,
  actions,
  parentName,
  toggle,
}: FolderRowProps): React.JSX.Element {
  const lead = toggle ? <DisclosureButton name={folder.name} toggle={toggle} /> : null;
  return (
    <tr id={rowIdOf(folder.id)} className="h-14">
      <NameCell depth={depth} lead={lead}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-primary">
          <Folder className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <Link
            href={folderPath(folder.id)}
            title={folder.name}
            className="truncate rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {folder.name}
          </Link>
          <InsideOf parentName={parentName} />
          <span className="text-xs text-muted-foreground sm:hidden tabular-nums">
            Carpeta · <CreatedAt value={folder.createdAt} />
          </span>
        </span>
      </NameCell>
      <td className="hidden px-2 py-2 text-right text-muted-foreground sm:table-cell">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Carpeta, sin tamaño</span>
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-muted-foreground sm:table-cell">
        <CreatedAt value={folder.createdAt} />
      </td>
      <td className="px-2 py-2 text-right">{actions}</td>
    </tr>
  );
}

export function FileRow({
  node: file,
  depth,
  actions,
  parentName,
  besideToggles,
}: FileRowProps): React.JSX.Element {
  return (
    <tr id={rowIdOf(file.id)} className="h-14">
      <NameCell depth={depth} lead={besideToggles ? <DisclosureSpacer /> : null}>
        <FileTypeChip fileType={CHIP_TYPE_BY_KIND[file.kind]} className="shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground" title={file.name}>
            {file.name}
          </span>
          <InsideOf parentName={parentName} />
          <span
            data-testid="file-size-mobile"
            className="text-xs text-muted-foreground sm:hidden tabular-nums"
          >
            {formatBytes(file.sizeBytes)}
          </span>
        </span>
      </NameCell>
      <td className="hidden px-2 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
        {formatBytes(file.sizeBytes)}
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-muted-foreground sm:table-cell">
        <CreatedAt value={file.createdAt} />
      </td>
      <td className="px-2 py-2 text-right">{actions}</td>
    </tr>
  );
}
