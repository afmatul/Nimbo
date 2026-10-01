import { formatBytes, type FileKind, type NodeSummary } from '@nimbo/contracts';
import { Folder } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { FileTypeChip, type FileType } from '../../../components/nimbo/file-type-chip';
import { folderPath } from '../routes';

type FolderNode = Extract<NodeSummary, { type: 'folder' }>;
type FileNode = Extract<NodeSummary, { type: 'file' }>;

export interface NodeTableProps {
  readonly nodes: readonly NodeSummary[];
  /** Dónde está el usuario («Mis archivos» o la carpeta abierta), para el título de la tabla. */
  readonly placeName: string;
  readonly renderRowActions: ((node: NodeSummary) => React.ReactNode) | undefined;
}

export const CHIP_TYPE_BY_KIND: Readonly<Record<FileKind, FileType>> = {
  docx: 'docx',
  pdf: 'pdf',
  xlsx: 'xlsx',
  pptx: 'pptx',
  imagen: 'img',
  texto: 'other',
  otro: 'other',
};

const dateFormatter = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' });

function CreatedAt({ value }: { readonly value: string }): React.JSX.Element {
  return <time dateTime={value}>{dateFormatter.format(new Date(value))}</time>;
}

/** Carpetas y archivos de una ubicación, en el orden de la API (carpetas primero, CA-5). */
export function NodeTable({
  nodes,
  placeName,
  renderRowActions,
}: NodeTableProps): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{`Carpetas y archivos en ${placeName}`}</caption>
        <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2">
              Nombre
            </th>
            <th scope="col" className="hidden w-24 px-2 py-2 text-right sm:table-cell">
              Tamaño
            </th>
            <th scope="col" className="hidden w-32 px-2 py-2 sm:table-cell">
              Modificado
            </th>
            <th scope="col" className="w-14 px-2 py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {nodes.map((node) =>
            node.type === 'folder' ? (
              <FolderRow key={node.id} folder={node} actions={renderRowActions?.(node)} />
            ) : (
              <FileRow key={node.id} file={node} actions={renderRowActions?.(node)} />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Abre la carpeta por su nombre (un enlace con URL propia); la fila no es clicable para no competir con el ⋮. */
function FolderRow({
  folder,
  actions,
}: {
  readonly folder: FolderNode;
  readonly actions: React.ReactNode;
}): React.JSX.Element {
  return (
    <tr className="h-14">
      <td className="px-4 py-2">
        <span className="flex min-w-0 items-center gap-3">
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
            <span className="text-xs text-muted-foreground sm:hidden tabular-nums">
              Carpeta · <CreatedAt value={folder.createdAt} />
            </span>
          </span>
        </span>
      </td>
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

function FileRow({
  file,
  actions,
}: {
  readonly file: FileNode;
  readonly actions: React.ReactNode;
}): React.JSX.Element {
  return (
    <tr className="h-14">
      <td className="px-4 py-2">
        <span className="flex min-w-0 items-center gap-3">
          <FileTypeChip fileType={CHIP_TYPE_BY_KIND[file.kind]} className="shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground" title={file.name}>
              {file.name}
            </span>
            <span
              data-testid="file-size-mobile"
              className="text-xs text-muted-foreground sm:hidden tabular-nums"
            >
              {formatBytes(file.sizeBytes)}
            </span>
          </span>
        </span>
      </td>
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
