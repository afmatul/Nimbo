import {
  formatBytes,
  isPreviewableKind,
  type FileSummary,
  type NodeSummary,
} from '@nimbo/contracts';
import { Eye, FilePen, Folder } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import {
  fileTypeColors,
  FileTypeChip,
  FileTypeIcon,
} from '../../../components/nimbo/file-type-chip';
import { DATE_LOCALE } from '../../../lib/format-date';
import { editorPath } from '../../editing/routes';
import { CHIP_TYPE_BY_KIND } from '../file-type';
import { previewPathOf } from '../preview/routes';
import { folderPath } from '../routes';

import { rowIdOf } from './node-rows';
import { useThumbnailRenderer } from './node-thumbnail';

type FolderNode = Extract<NodeSummary, { type: 'folder' }>;
type FileNode = Extract<NodeSummary, { type: 'file' }>;

export interface NodeCardsProps {
  readonly nodes: readonly NodeSummary[];
  /** Dónde está el usuario, para los títulos de las secciones. */
  readonly placeName: string;
  readonly renderRowActions: ((node: NodeSummary) => React.ReactNode) | undefined;
  /** «Vista rápida» de un archivo previsualizable; sin él la tarjeta no ofrece el botón. */
  readonly onQuickLook?: ((file: FileSummary) => void) | undefined;
}

const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: 'medium' });

const GRID_CLASS = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const CARD_CLASS =
  'relative rounded-lg border border-border bg-card shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40';
/** El enlace del nombre cubre toda la tarjeta; el menú ⋮ queda por encima para seguir siendo clicable. */
const STRETCHED_LINK_CLASS =
  'truncate rounded-sm font-medium text-foreground after:absolute after:inset-0 after:content-[""] focus-visible:outline-none';
const QUICK_BUTTON_CLASS =
  'flex h-11 w-11 items-center justify-center rounded-md text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8';
const ACTIONS_CLASS = 'relative z-10 shrink-0';

function UpdatedAt({ value }: { readonly value: string }): React.JSX.Element {
  return <time dateTime={value}>{dateFormatter.format(new Date(value))}</time>;
}

function FolderCard({
  folder,
  actions,
}: {
  readonly folder: FolderNode;
  readonly actions: React.ReactNode;
}): React.JSX.Element {
  return (
    <li
      id={rowIdOf(folder.id)}
      className={`${CARD_CLASS} flex min-h-28 flex-col justify-between gap-4 p-4`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-primary">
          <Folder className="h-6 w-6" aria-hidden="true" />
        </span>
        <Link
          href={folderPath(folder.id)}
          title={folder.name}
          className={`${STRETCHED_LINK_CLASS} min-w-0 flex-1 pt-1 text-base`}
        >
          {folder.name}
        </Link>
        <div className={ACTIONS_CLASS}>{actions}</div>
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <div className="flex gap-1">
          <dt>Modificada</dt>
          <dd>
            <UpdatedAt value={folder.updatedAt} />
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Creada</dt>
          <dd>
            <UpdatedAt value={folder.createdAt} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** Nombre del archivo: enlace a su vista previa si se puede previsualizar, texto si no. */
function FileName({ file }: { readonly file: FileNode }): React.JSX.Element {
  if (file.kind === 'docx') {
    return (
      <Link href={editorPath(file.id)} title={file.name} className={STRETCHED_LINK_CLASS}>
        {file.name}
        <span className="sr-only">, abrir en el editor</span>
      </Link>
    );
  }
  if (!isPreviewableKind(file.kind)) {
    return (
      <span className="truncate font-medium text-foreground" title={file.name}>
        {file.name}
      </span>
    );
  }
  return (
    <Link
      href={previewPathOf(file.id)}
      prefetch={false}
      title={file.name}
      className={STRETCHED_LINK_CLASS}
    >
      {file.name}
      <span className="sr-only">, previsualizar</span>
    </Link>
  );
}

function QuickLookButton({
  file,
  onQuickLook,
}: {
  readonly file: FileNode;
  readonly onQuickLook: ((file: FileSummary) => void) | undefined;
}): React.JSX.Element | null {
  if (file.kind === 'docx') {
    return (
      <Link
        href={editorPath(file.id)}
        aria-label={`Abrir ${file.name} en el editor`}
        className={QUICK_BUTTON_CLASS}
      >
        <FilePen className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  }
  if (onQuickLook === undefined || !isPreviewableKind(file.kind)) return null;
  return (
    <button
      type="button"
      aria-label={`Vista rápida de ${file.name}`}
      onClick={() => onQuickLook(file)}
      className={QUICK_BUTTON_CLASS}
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function FileCard({
  file,
  actions,
  onQuickLook,
}: {
  readonly file: FileNode;
  readonly actions: React.ReactNode;
  readonly onQuickLook: ((file: FileSummary) => void) | undefined;
}): React.JSX.Element {
  const renderThumbnail = useThumbnailRenderer();
  return (
    <li id={rowIdOf(file.id)} className={`${CARD_CLASS} flex flex-col gap-3 p-3`}>
      <div
        aria-hidden="true"
        className="relative flex h-32 items-center justify-center overflow-hidden rounded-md"
        style={fileTypeColors(CHIP_TYPE_BY_KIND[file.kind])}
        data-testid="file-card-preview"
      >
        <FileTypeIcon
          fileType={CHIP_TYPE_BY_KIND[file.kind]}
          className="[&>svg]:h-14 [&>svg]:w-14 [&>svg]:stroke-[1.5]"
        />
        {renderThumbnail?.(file)}
      </div>
      <div className="flex items-start gap-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <FileName file={file} />
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
            <FileTypeChip fileType={CHIP_TYPE_BY_KIND[file.kind]} />
            <span>
              {formatBytes(file.sizeBytes)} · <UpdatedAt value={file.updatedAt} />
            </span>
          </span>
        </span>
        <div className={`${ACTIONS_CLASS} flex items-center`}>
          <QuickLookButton file={file} onQuickLook={onQuickLook} />
          {actions}
        </div>
      </div>
    </li>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      <ul className={GRID_CLASS}>{children}</ul>
    </section>
  );
}

/** Carpetas arriba y archivos en tarjetas debajo (mockup `explorador--cuadricula`); acciones de fila reutilizadas. */
export function NodeCards({
  nodes,
  placeName,
  renderRowActions,
  onQuickLook,
}: NodeCardsProps): React.JSX.Element {
  const folders = nodes.filter((node): node is FolderNode => node.type === 'folder');
  const files = nodes.filter((node): node is FileNode => node.type === 'file');
  return (
    <div className="flex flex-col gap-6" aria-label={`Carpetas y archivos en ${placeName}`}>
      {folders.length === 0 ? null : (
        <Section title="Carpetas">
          {folders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} actions={renderRowActions?.(folder)} />
          ))}
        </Section>
      )}
      {files.length === 0 ? null : (
        <Section title="Archivos">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              actions={renderRowActions?.(file)}
              onQuickLook={onQuickLook}
            />
          ))}
        </Section>
      )}
    </div>
  );
}
