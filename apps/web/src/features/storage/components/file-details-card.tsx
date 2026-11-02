'use client';

import { formatBytes, type IndexingStatusResponse } from '@nimbo/contracts';
import Link from 'next/link';
import type * as React from 'react';

import { dateTimeLabel } from '../../../lib/format-date';
import { indexingDetailOf } from '../../intelligence/indexing-messages';
import { FILE_KIND_LABELS } from '../file-kind-label';
import type { ReadyVersionsListing } from '../hooks/use-file-versions';
import { locationPath, MY_FILES_LABEL } from '../routes';
import { currentVersionOf, totalVersionBytes } from '../version-history';

const OPEN_FOLDER_LABEL = 'Abrir la carpeta';

type DetailRow = readonly [string, React.ReactNode];

export interface FileDetailsCardProps {
  readonly listing: ReadyVersionsListing;
  readonly indexing: IndexingStatusResponse | null;
}

/** «Mis archivos» en la raíz; si no, enlace a la carpeta (la API da su id, no su nombre). */
function LocationLink({ folderId }: { readonly folderId: string | null }): React.JSX.Element {
  return (
    <Link
      href={locationPath(folderId)}
      className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {folderId === null ? MY_FILES_LABEL : OPEN_FOLDER_LABEL}
    </Link>
  );
}

function detailRowsOf({ listing, indexing }: FileDetailsCardProps): readonly DetailRow[] {
  const current = currentVersionOf(listing.items);
  const { file } = listing;
  const indexingDetail =
    indexing && current ? indexingDetailOf(indexing, current.number, listing.loadedAt) : null;
  return [
    ['Tipo', FILE_KIND_LABELS[file.kind]],
    ['Tamaño', current ? `${formatBytes(current.sizeBytes)} (versión actual)` : '—'],
    ['Con versiones', `${formatBytes(totalVersionBytes(listing.items))} de tu espacio`],
    ['Ubicación', <LocationLink key="ubicacion" folderId={file.folderId} />],
    ['Modificado', current ? dateTimeLabel(current.createdAt, listing.loadedAt) : '—'],
    ...(indexingDetail === null ? [] : [['Indexación', indexingDetail] as const]),
  ];
}

/**
 * Tipo y ubicación (CA-20), tamaño de la actual, espacio de las versiones que cuentan (014b), cuándo cambió
 * por última vez y, si el tipo se indexa, cuándo y de qué versión (019, RN-1).
 */
export function FileDetailsCard(props: FileDetailsCardProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="detalles-archivo"
      className="rounded-lg border border-border bg-card shadow-card"
    >
      <h2
        id="detalles-archivo"
        className="border-b border-border px-4 py-4 text-base font-semibold text-foreground sm:px-5"
      >
        Detalles
      </h2>
      <dl className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-3 sm:px-5">
        {detailRowsOf(props).map(([term, value]) => (
          <div key={term}>
            <dt className="text-secondary-foreground">{term}</dt>
            <dd className="tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
