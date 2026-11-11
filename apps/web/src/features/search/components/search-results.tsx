'use client';

import { formatBytes, type SearchHit } from '@nimbo/contracts';
import { Folder, Info, TextSearch, Users } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { FileTypeChip } from '../../../components/nimbo/file-type-chip';
import { StatusBadge } from '../../../components/nimbo/status-badge';
import { dayLabel } from '../../../lib/format-date';
import { cn } from '../../../lib/utils';
import { CHIP_TYPE_BY_KIND } from '../../storage/file-type';
import { fileDetailPath, folderPath, locationPath, MY_FILES_LABEL } from '../../storage/routes';

const LINK_CLASSES =
  'rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
/** Ubicación de un resultado de otra cuenta cuya carpeta no se ve (012, spec 018 CA-2). */
const SHARED_LABEL = 'Compartido contigo';
const HEAD_CLASSES = 'px-2 py-2 text-xs font-medium uppercase tracking-wide';
/** Marca de un archivo que coincide por contenido y no por nombre (018b CA-8, RN-3). */
const CONTENT_MATCH_LABEL = 'Coincide en el contenido';
/** Nota de alcance (018b CA-8): describe la lista y acompaña «sin resultados». */
const SCOPE_NOTE_ID = 'buscar-alcance';
const SCOPE_NOTE =
  'También buscamos dentro de los documentos ya indexados. Los que aún se están procesando, y los que no tienen texto (como las imágenes), solo aparecen por su nombre.';

/** «Resultados para «texto»», sin total de coincidencias (RN-6). */
export const resultsTitle = (q: string): string => `Resultados para «${q}»`;

/** Qué documentos se buscan por dentro (018b CA-8, mockup `resultados-por-contenido`, decisión 3). */
export function ScopeNote(): React.JSX.Element {
  return (
    <p
      id={SCOPE_NOTE_ID}
      className="flex max-w-3xl items-start gap-2 text-sm text-secondary-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{SCOPE_NOTE}</span>
    </p>
  );
}

function HitDate({ value }: { readonly value: string }): React.JSX.Element {
  return <time dateTime={value}>{dayLabel(value)}</time>;
}

/** Ícono del resultado: la carpeta del explorador o el chip de tipo del archivo. */
function HitIcon({ hit }: { readonly hit: SearchHit }): React.JSX.Element {
  if (hit.type === 'file')
    return <FileTypeChip fileType={CHIP_TYPE_BY_KIND[hit.kind]} className="shrink-0" />;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-primary">
      <Folder className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/** Sin carpeta visible, «Compartido contigo» (de otra cuenta, sin enlace) o «Mis archivos» (CA-2). */
function HitLocation({ hit }: { readonly hit: SearchHit }): React.JSX.Element {
  if (hit.location === null && hit.shared) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-secondary-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{SHARED_LABEL}</span>
      </span>
    );
  }
  return (
    <Link
      href={locationPath(hit.location?.id ?? null)}
      className={cn(
        LINK_CLASSES,
        'inline-flex min-w-0 items-center gap-1.5 text-secondary-foreground',
      )}
    >
      <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{hit.location?.name ?? MY_FILES_LABEL}</span>
    </Link>
  );
}

/** «96 KB» de un archivo o «Carpeta» (sin tamaño). */
const sizeOf = (hit: SearchHit): string =>
  hit.type === 'file' ? formatBytes(hit.sizeBytes) : 'Carpeta';

/** Nombre que abre la carpeta en el explorador o el archivo en su ficha (CA-10); a 360 px, ubicación y datos debajo. */
function NameCell({ hit }: { readonly hit: SearchHit }): React.JSX.Element {
  const href = hit.type === 'folder' ? folderPath(hit.id) : fileDetailPath(hit.id);
  return (
    <td className="px-3 py-2.5 sm:px-4">
      <span className="flex min-w-0 items-center gap-3">
        <HitIcon hit={hit} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={href}
            title={hit.name}
            className={cn(LINK_CLASSES, 'truncate font-medium text-foreground')}
          >
            {hit.name}
          </Link>
          {hit.type === 'file' && hit.matchedBy === 'content' ? (
            <span className="flex">
              <StatusBadge tone="neutral" icon={TextSearch} label={CONTENT_MATCH_LABEL} />
            </span>
          ) : null}
          <span className="flex min-w-0 text-xs sm:hidden">
            <HitLocation hit={hit} />
          </span>
          <span className="text-xs tabular-nums text-secondary-foreground sm:hidden">
            {sizeOf(hit)} · <HitDate value={hit.updatedAt} />
          </span>
        </span>
      </span>
    </td>
  );
}

function HitRow({ hit }: { readonly hit: SearchHit }): React.JSX.Element {
  return (
    <tr className="h-14">
      <NameCell hit={hit} />
      <td className="hidden px-2 py-2 sm:table-cell">
        <HitLocation hit={hit} />
      </td>
      <td className="hidden px-2 py-2 text-right tabular-nums text-secondary-foreground sm:table-cell">
        {hit.type === 'file' ? formatBytes(hit.sizeBytes) : <FolderSize />}
      </td>
      <td className="hidden px-2 py-2 tabular-nums text-secondary-foreground sm:table-cell">
        <HitDate value={hit.updatedAt} />
      </td>
    </tr>
  );
}

function FolderSize(): React.JSX.Element {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">Carpeta, sin tamaño</span>
    </>
  );
}

function ResultsHead(): React.JSX.Element {
  return (
    <thead className="border-b border-border bg-muted/40 text-left text-secondary-foreground">
      <tr>
        <th scope="col" className={cn(HEAD_CLASSES, 'px-3 sm:px-4')}>
          Nombre
        </th>
        <th scope="col" className={cn(HEAD_CLASSES, 'hidden w-1/4 sm:table-cell')}>
          Ubicación
        </th>
        <th scope="col" className={cn(HEAD_CLASSES, 'hidden w-24 text-right sm:table-cell')}>
          Tamaño
        </th>
        <th scope="col" className={cn(HEAD_CLASSES, 'hidden w-32 sm:table-cell')}>
          Modificado
        </th>
      </tr>
    </thead>
  );
}

/** Carpetas y luego archivos, en el orden de la API (CA-2); la fila es la del explorador más «Ubicación», sin menú ⋮. */
export function SearchResults({
  q,
  hits,
}: {
  readonly q: string;
  readonly hits: readonly SearchHit[];
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full table-fixed text-sm" aria-describedby={SCOPE_NOTE_ID}>
        <caption className="sr-only">{resultsTitle(q)}</caption>
        <ResultsHead />
        <tbody className="divide-y divide-border">
          {hits.map((hit) => (
            <HitRow key={hit.id} hit={hit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
