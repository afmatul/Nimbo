'use client';

import type { ReceivedShare, ShareLevel } from '@nimbo/contracts';
import { Eye, Folder, Pencil } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { dateTimeLabel } from '../../../lib/format-date';
import { fileDetailPath, folderPath } from '../../storage/routes';
import { receivedFileType } from '../received-file-type';
import { LEVEL_LABELS } from '../share-levels';

const LEVEL_ICONS: Readonly<Record<ShareLevel, typeof Eye>> = { VIEWER: Eye, EDITOR: Pencil };

/** Carpeta → su contenido; archivo → su ficha (spec 012b S-4). */
export function openPathOf(share: ReceivedShare): string {
  return share.nodeType === 'folder' ? folderPath(share.nodeId) : fileDetailPath(share.nodeId);
}

/** Mi nivel con ícono y texto, en una etiqueta neutral: el color no lo distingue (mockup, decisión 2). */
function LevelBadge({ level }: { readonly level: ShareLevel }): React.JSX.Element {
  const Icon = LEVEL_ICONS[level];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {LEVEL_LABELS[level]}
    </span>
  );
}

function TypeIcon({ share }: { readonly share: ReceivedShare }): React.JSX.Element {
  if (share.nodeType === 'file') {
    return <FileTypeChip fileType={receivedFileType(share.name)} className="shrink-0" />;
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-primary">
      <Folder className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

interface RowProps {
  readonly share: ReceivedShare;
  /** Momento de la lectura, para «hoy» y «ayer». */
  readonly loadedAt: number;
  readonly actions: React.ReactNode;
}

/** Nombre (enlace), tipo y, a 360 px, quién lo compartió, mi nivel y la fecha bajo el nombre (mockup, decisión 1). */
function NameCell({ share, loadedAt }: Omit<RowProps, 'actions'>): React.JSX.Element {
  const date = dateTimeLabel(share.createdAt, loadedAt);
  return (
    <td className="py-2 pr-2 pl-3 sm:pl-4">
      <span className="flex min-w-0 items-center gap-3">
        <TypeIcon share={share} />
        <span className="flex min-w-0 flex-col">
          <Link
            href={openPathOf(share)}
            className="truncate rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {share.name}
          </Link>
          {share.nodeType === 'folder' ? (
            <span className="text-xs text-muted-foreground">Carpeta</span>
          ) : null}
          <span className="text-xs text-secondary-foreground sm:hidden">
            {`De ${share.owner.displayName} · ${LEVEL_LABELS[share.level]} · ${date}`}
          </span>
        </span>
      </span>
    </td>
  );
}

/** Una fila de «Compartidos conmigo» (spec 012b CA-8): del propietario solo su nombre visible, nunca su correo. */
export function ReceivedShareRow({ share, loadedAt, actions }: RowProps): React.JSX.Element {
  return (
    <tr className="h-14">
      <NameCell share={share} loadedAt={loadedAt} />
      <td className="hidden px-2 py-2 text-secondary-foreground sm:table-cell">
        {share.owner.displayName}
      </td>
      <td className="hidden px-2 py-2 sm:table-cell">
        <LevelBadge level={share.level} />
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-secondary-foreground sm:table-cell">
        <time dateTime={share.createdAt}>{dateTimeLabel(share.createdAt, loadedAt)}</time>
      </td>
      <td className="px-2 py-2 text-right">{actions}</td>
    </tr>
  );
}
