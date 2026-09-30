'use client';

import { formatBytes, type FileKind, type FileSummary } from '@nimbo/contracts';
import { Upload } from 'lucide-react';
import * as React from 'react';

import { FileTypeChip, type FileType } from '../../../components/nimbo/file-type-chip';
import { StateView } from '../../../components/nimbo/state-view';
import { Button } from '../../../components/ui/button';

import { ExplorerErrorState } from './explorer-error-state';
import { UploadDropzone } from './upload-dropzone';

export type FileExplorerStatus = 'loading' | 'ready' | 'error';

export interface FileExplorerProps {
  readonly status: FileExplorerStatus;
  readonly files: readonly FileSummary[];
  /**
   * Máximo por archivo ya formateado; viene de `PlanLimits` por la API, nunca del código (RN-1). Sin él (aún no hay
   * contrato que lo exponga a `web`) los textos omiten la cifra.
   */
  readonly maxFileLabel?: string | undefined;
  readonly onFiles: (files: readonly File[]) => void;
  readonly onRetry: () => void;
  /** Selector de archivos de la vista, para que otro control (p. ej. «Subir de nuevo» del panel) lo abra. */
  readonly fileInputRef?: React.RefObject<HTMLInputElement | null>;
  readonly renderRowActions?: (file: FileSummary) => React.ReactNode;
  /** Aviso que va arriba de la lista (fallo de descarga, CA-21). */
  readonly notice?: React.ReactNode;
}

const CHIP_TYPE_BY_KIND: Readonly<Record<FileKind, FileType>> = {
  docx: 'docx',
  pdf: 'pdf',
  xlsx: 'xlsx',
  pptx: 'pptx',
  imagen: 'img',
  texto: 'other',
  otro: 'other',
};

/** Pantallas táctiles sin arrastre: la descripción del vacío no menciona arrastrar (mockup `explorador--vacio`). */
const NO_DRAG_QUERY = '(hover: none), (pointer: coarse)';

const dateFormatter = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' });

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

/** Raíz de «Mis archivos»: encabezado con «Subir archivos», zona de arrastre y los estados de spec §9. */
export function FileExplorer({
  status,
  files,
  maxFileLabel,
  onFiles,
  onRetry,
  fileInputRef,
  renderRowActions,
  notice,
}: FileExplorerProps): React.JSX.Element {
  const ownInputRef = React.useRef<HTMLInputElement>(null);
  const inputRef = fileInputRef ?? ownInputRef;
  const openPicker = (): void => inputRef.current?.click();

  return (
    <section className="flex flex-col gap-4" aria-labelledby="mis-archivos-titulo">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="mis-archivos-titulo"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          Mis archivos
        </h1>
        <Button type="button" onClick={openPicker}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Subir archivos
        </Button>
      </header>

      <UploadDropzone maxFileLabel={maxFileLabel} onFiles={onFiles} inputRef={inputRef}>
        {notice ? (
          <div data-testid="explorer-notice" className="mb-4">
            {notice}
          </div>
        ) : null}
        <ExplorerBody
          status={status}
          files={files}
          maxFileLabel={maxFileLabel}
          onRetry={onRetry}
          onUpload={openPicker}
          renderRowActions={renderRowActions}
        />
      </UploadDropzone>
    </section>
  );
}

interface ExplorerBodyProps {
  readonly status: FileExplorerStatus;
  readonly files: readonly FileSummary[];
  readonly maxFileLabel: string | undefined;
  readonly onRetry: () => void;
  readonly onUpload: () => void;
  readonly renderRowActions: FileExplorerProps['renderRowActions'] | undefined;
}

function ExplorerBody({
  status,
  files,
  maxFileLabel,
  onRetry,
  onUpload,
  renderRowActions,
}: ExplorerBodyProps): React.JSX.Element {
  if (status === 'loading') return <StateView type="loading" title="Cargando tus archivos…" />;
  if (status === 'error') return <ExplorerErrorState onRetry={onRetry} />;
  if (files.length === 0) return <EmptyExplorer maxFileLabel={maxFileLabel} onUpload={onUpload} />;
  return <FileTable files={files} renderRowActions={renderRowActions} />;
}

function EmptyExplorer({
  maxFileLabel,
  onUpload,
}: {
  readonly maxFileLabel: string | undefined;
  readonly onUpload: () => void;
}): React.JSX.Element {
  const canDrag = useCanDragFiles();
  const invitation = canDrag
    ? 'Sube tus documentos con el botón o arrástralos a esta página.'
    : 'Sube tus documentos desde tu dispositivo.';
  const limit =
    maxFileLabel === undefined ? '' : ` Tu plan permite hasta ${maxFileLabel} por archivo.`;
  return (
    <StateView
      type="empty"
      title="Aún no tienes archivos"
      description={`${invitation}${limit}`}
      action={{ label: 'Subir archivos', onClick: onUpload }}
    />
  );
}

function FileTable({
  files,
  renderRowActions,
}: {
  readonly files: readonly FileSummary[];
  readonly renderRowActions: FileExplorerProps['renderRowActions'] | undefined;
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Archivos de Mis archivos</caption>
        <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2">
              Nombre
            </th>
            <th scope="col" className="w-24 px-2 py-2 text-right">
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
          {files.map((file) => (
            <FileRow key={file.id} file={file} actions={renderRowActions?.(file)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileRow({
  file,
  actions,
}: {
  readonly file: FileSummary;
  readonly actions: React.ReactNode;
}): React.JSX.Element {
  return (
    <tr className="h-14">
      <td className="px-4 py-2">
        <span className="flex min-w-0 items-center gap-3">
          <FileTypeChip fileType={CHIP_TYPE_BY_KIND[file.kind]} className="shrink-0" />
          <span className="min-w-0 truncate font-medium text-foreground" title={file.name}>
            {file.name}
          </span>
        </span>
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {formatBytes(file.sizeBytes)}
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-muted-foreground sm:table-cell">
        <time dateTime={file.createdAt}>{dateFormatter.format(new Date(file.createdAt))}</time>
      </td>
      <td className="px-2 py-2 text-right">{actions}</td>
    </tr>
  );
}
