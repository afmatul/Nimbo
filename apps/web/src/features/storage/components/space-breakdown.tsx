import { formatBytes } from '@nimbo/contracts';
import Link from 'next/link';
import type * as React from 'react';

import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { TRASH_PATH } from '../routes';
import type { SpaceSummaryResponse } from '../space-types';

import { retentionLabel } from './trash-summary';

/** Rayado de la papelera: no depende del color (mockup `resumen-espacio`, ≥ 8:1 sobre `card`). */
const TRASH_STRIPES =
  'repeating-linear-gradient(135deg, var(--secondary-foreground) 0 3px, var(--card) 3px 6px)';

interface Segment {
  readonly name: string;
  readonly description: string;
  readonly bytesOf: (summary: SpaceSummaryResponse) => number;
  readonly swatch: React.CSSProperties;
  /** Parte del espacio usado: lleva «% del usado». Las reservas no lo son (plan D-5). */
  readonly inUsed: boolean;
  readonly trash?: boolean;
}

const TYPE_SEGMENTS: readonly Segment[] = [
  {
    name: 'Documentos',
    description: '.docx, .pdf, .txt, .md, .xlsx y .pptx',
    bytesOf: (summary) => summary.breakdown.documentsBytes,
    swatch: { backgroundColor: 'var(--file-docx)' },
    inUsed: true,
  },
  {
    name: 'Imágenes',
    description: 'Fotos, capturas y otras imágenes',
    bytesOf: (summary) => summary.breakdown.imagesBytes,
    swatch: { backgroundColor: 'var(--file-img)' },
    inUsed: true,
  },
  {
    name: 'Otros',
    description: 'Videos, comprimidos y demás formatos',
    bytesOf: (summary) => summary.breakdown.otherBytes,
    swatch: { backgroundColor: 'var(--file-other)' },
    inUsed: true,
  },
  {
    name: 'Papelera',
    description: 'Archivos y carpetas que eliminaste',
    bytesOf: (summary) => summary.breakdown.trashBytes,
    swatch: { backgroundImage: TRASH_STRIPES },
    inUsed: true,
    trash: true,
  },
];

const RESERVED_SEGMENT: Segment = {
  name: 'Cargas en curso',
  description: 'Espacio reservado para lo que estás subiendo',
  bytesOf: (summary) => summary.reservedBytes,
  swatch: { backgroundColor: 'var(--brand)' },
  inUsed: false,
};

/** Segmentos en el orden del mockup; «Cargas en curso» solo con reservas (plan D-5, D-19 c). */
function segmentsOf(summary: SpaceSummaryResponse): readonly Segment[] {
  return summary.reservedBytes > 0 ? [...TYPE_SEGMENTS, RESERVED_SEGMENT] : TYPE_SEGMENTS;
}

/** Porcentaje del espacio usado, sobre bytes exactos (RN-3); sin nada usado, 0. */
function shareOfUsed(bytes: number, usedBytes: number): number {
  return usedBytes > 0 ? Math.round((bytes / usedBytes) * 100) : 0;
}

function percentOfQuota(bytes: number, quotaBytes: number): string {
  return quotaBytes > 0 ? `${String((bytes / quotaBytes) * 100)}%` : '0%';
}

/** Barra apilada sobre la cuota total; lo que sobra es «Disponible». Decorativa: las cifras van en la lista. */
function SpaceStack({ summary }: { readonly summary: SpaceSummaryResponse }): React.JSX.Element {
  const visible = segmentsOf(summary).filter((segment) => segment.bytesOf(summary) > 0);
  return (
    <div
      data-space-stack=""
      aria-hidden="true"
      className="mt-4 flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-muted"
    >
      {visible.map((segment) => (
        <span
          key={segment.name}
          className="block h-full min-w-1"
          style={{
            ...segment.swatch,
            width: percentOfQuota(segment.bytesOf(summary), summary.quotaBytes),
          }}
        />
      ))}
    </div>
  );
}

interface RowProps {
  readonly name: string;
  readonly description?: string;
  readonly size: string;
  readonly share?: number | undefined;
  readonly swatch: React.ReactNode;
}

/** Fila de la lista: muestra, nombre, formatos, tamaño y porcentaje (a 360 px debajo del tamaño). */
function RowContent({ name, description, size, share, swatch }: RowProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      {swatch}
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{name}</span>
        {description ? (
          <span className="block text-xs text-secondary-foreground">{description}</span>
        ) : null}
      </div>
      <span className="text-right text-sm font-semibold tabular-nums">
        {size}
        {share === undefined ? null : (
          <small className="block text-xs font-normal text-secondary-foreground sm:hidden">{`${String(share)} % del usado`}</small>
        )}
      </span>
      {share === undefined ? null : (
        <span className="hidden w-12 text-right text-sm tabular-nums text-secondary-foreground sm:block">
          {`${String(share)} %`}
          <span className="sr-only"> del usado</span>
        </span>
      )}
    </div>
  );
}

function Swatch({
  style,
  className,
}: {
  readonly style?: React.CSSProperties;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn('mt-1 h-3.5 w-3.5 shrink-0 rounded-sm', className)}
      style={style}
    />
  );
}

function TrashNote({ summary }: { readonly summary: SpaceSummaryResponse }): React.JSX.Element {
  if (summary.breakdown.trashBytes === 0) {
    return <p className="mt-1.5 pl-6.5 text-xs text-secondary-foreground">Está vacía.</p>;
  }
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 pl-6.5 text-xs text-secondary-foreground">
      {`Cuenta en tu cuota hasta que la vacías o pasan ${retentionLabel(summary.trashRetentionDays)} desde que moviste cada elemento.`}
      <Link
        href={TRASH_PATH}
        className="inline-flex min-h-6 items-center rounded-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ver papelera
      </Link>
    </p>
  );
}

const ROW_CLASS = 'border-t border-border py-3 first:border-t-0';

function SegmentRow({
  segment,
  summary,
}: {
  readonly segment: Segment;
  readonly summary: SpaceSummaryResponse;
}): React.JSX.Element {
  const bytes = segment.bytesOf(summary);
  return (
    <li className={cn(ROW_CLASS, segment.trash && 'border-dashed border-input')}>
      <RowContent
        name={segment.name}
        description={segment.description}
        size={formatBytes(bytes)}
        share={segment.inUsed ? shareOfUsed(bytes, summary.usedBytes) : undefined}
        swatch={<Swatch style={segment.swatch} />}
      />
      {segment.trash ? <TrashNote summary={summary} /> : null}
    </li>
  );
}

/**
 * «En qué se va tu espacio» (CA-2, CA-3): Documentos + Imágenes + Otros + Papelera (+ Cargas en curso) + Disponible
 * = cuota (plan D-5). La papelera va rayada y separada por una línea discontinua.
 */
export function SpaceBreakdown({
  summary,
}: {
  readonly summary: SpaceSummaryResponse;
}): React.JSX.Element {
  return (
    <Card role="region" aria-labelledby="desglose-titulo" className="p-5">
      <h2 id="desglose-titulo" className="text-base font-semibold">
        En qué se va tu espacio
      </h2>
      <p className="mt-1 text-sm text-secondary-foreground">
        Por tipo de archivo, sobre el espacio usado.
      </p>
      <SpaceStack summary={summary} />
      <ul className="mt-4">
        {segmentsOf(summary).map((segment) => (
          <SegmentRow key={segment.name} segment={segment} summary={summary} />
        ))}
        <li className={ROW_CLASS}>
          <RowContent
            name="Disponible"
            size={formatBytes(summary.availableBytes)}
            swatch={<Swatch className="border border-input bg-muted" />}
          />
        </li>
      </ul>
    </Card>
  );
}
