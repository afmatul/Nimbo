'use client';

import {
  formatBytes,
  type FileVersionSummary,
  type IndexingStatusResponse,
  type VersionedFile,
} from '@nimbo/contracts';
import { ChevronLeft, Download, MapPin, Share2 } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { Button } from '../../../components/ui/button';
import { IndexingStatusChip } from '../../intelligence/components/indexing-status-chip';
import { CHIP_TYPE_BY_KIND } from '../file-type';
import type { ReadyVersionsListing } from '../hooks/use-file-versions';
import type { VersionActions } from '../hooks/use-version-actions';
import { locationPath, MY_FILES_LABEL } from '../routes';
import { currentVersionOf } from '../version-history';

import { AskAgentButton } from './ask-agent-button';

/** Título mientras el archivo no llegó (cargando o error). */
const GENERIC_TITLE = 'Versiones del archivo';
const BACK_TO_FOLDER_LABEL = 'Volver a la carpeta';

export interface FileHeaderProps {
  readonly ready: ReadyVersionsListing | null;
  readonly actions: VersionActions;
  readonly indexing: IndexingStatusResponse | null;
  readonly fileId: string;
  /** «Compartir» con el nombre del archivo (012b CA-1). */
  readonly onShare: (name: string) => void;
}

/**
 * Tipo, nombre (CA-20), versión actual, estado de indexación (019), «Preguntar sobre esto» (020b CA-15), «Compartir»
 * (012b CA-1) y «Descargar» de la versión actual.
 */
export function FileHeader(props: FileHeaderProps): React.JSX.Element {
  const { ready, actions } = props;
  const current = ready ? currentVersionOf(ready.items) : undefined;
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {ready ? (
          <FileTypeChip fileType={CHIP_TYPE_BY_KIND[ready.file.kind]} className="mt-1 shrink-0" />
        ) : null}
        <div className="min-w-0">
          <FileTitle ready={ready} current={current} />
          <IndexingStatusChip status={props.indexing} />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {ready ? (
          <AskAndShare file={ready.file} fileId={props.fileId} onShare={props.onShare} />
        ) : null}
        {current ? <DownloadCurrentButton onClick={() => void actions.download(current)} /> : null}
      </div>
    </header>
  );
}

interface AskAndShareProps {
  readonly file: VersionedFile;
  readonly fileId: string;
  readonly onShare: (name: string) => void;
}

/** «Preguntar sobre esto» con el archivo como ámbito y «Compartir», una vez que se sabe su nombre. */
function AskAndShare({ file, fileId, onShare }: AskAndShareProps): React.JSX.Element {
  return (
    <>
      <AskAgentButton scope={{ type: 'file', id: fileId, name: file.name }} />
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={() => onShare(file.name)}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Compartir
      </Button>
    </>
  );
}

function DownloadCurrentButton({ onClick }: { readonly onClick: () => void }): React.JSX.Element {
  return (
    <Button
      type="button"
      className="w-full sm:w-auto"
      aria-label="Descargar la versión actual"
      onClick={onClick}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Descargar
    </Button>
  );
}

interface FileTitleProps {
  readonly ready: ReadyVersionsListing | null;
  readonly current: FileVersionSummary | undefined;
}

function FileTitle({ ready, current }: FileTitleProps): React.JSX.Element {
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

/** Vuelve a donde está el archivo: la raíz o su carpeta (mockup: «‹ {carpeta}»). */
export function BackLink({ folderId }: { readonly folderId: string | null }): React.JSX.Element {
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

/** «Ubicación citada: <etiqueta>» (020b CA-11): texto plano, solo con el archivo ya cargado (CA-12). */
export function CitedLocation({
  label,
}: {
  readonly label: string | undefined;
}): React.JSX.Element | null {
  if (!label) return null;
  return (
    <p className="mt-2 flex items-start gap-2 text-sm text-secondary-foreground">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="wrap-anywhere">{`Ubicación citada: ${label}`}</span>
    </p>
  );
}
