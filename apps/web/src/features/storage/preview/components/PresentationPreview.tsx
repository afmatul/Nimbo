'use client';

import { EyeOff } from 'lucide-react';
import type * as React from 'react';

import { cn } from '../../../../lib/utils';
import {
  useOoxmlReading,
  type OoxmlReaderProps,
  type OoxmlReading,
} from '../hooks/use-ooxml-reading';
import type { SlideBlock, SlideProjection, SlideSummary } from '../readers/pptx-model';

import { EmptyFileNotice, UnitNavigation } from './ReaderNavigation';

type Presentation = OoxmlReading<'pptx'>;
type TableBlock = Extract<SlideBlock, { kind: 'table' }>;

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function SlideTable(props: { readonly block: TableBlock; readonly label: string }) {
  return (
    <div
      role="region"
      aria-label={props.label}
      tabIndex={0}
      className={cn('max-w-full overflow-x-auto rounded-md border border-border', FOCUS_RING)}
    >
      <table className="min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">{props.label}</caption>
        <tbody>
          {props.block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b border-r border-border px-3 py-2 align-top text-foreground"
                >
                  <div className="min-w-24 max-w-xs whitespace-pre-wrap break-words">{cell}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bloques en el orden del reader; texto con sus saltos, sin coordenadas, temas ni fuentes. */
function SlideBlocks(props: { readonly unit: SlideProjection; readonly number: number }) {
  if (props.unit.blocks.length === 0)
    return <p className="text-muted-foreground">Esta diapositiva no tiene texto para mostrar.</p>;
  let tables = 0;
  return (
    <div className="space-y-4">
      {props.unit.blocks.map((block, index) =>
        block.kind === 'text' ? (
          <p key={index} className="whitespace-pre-wrap break-words text-foreground">
            {block.text}
          </p>
        ) : (
          <SlideTable
            key={index}
            block={block}
            label={`Tabla ${++tables} de la diapositiva ${props.number}`}
          />
        ),
      )}
    </div>
  );
}

type SlideCardProps = {
  readonly summary: SlideSummary;
  readonly unit: SlideProjection | null;
};

/** Tarjeta 16:9 que crece si el texto no cabe; una diapositiva oculta sigue siendo navegable. */
function SlideCard({ summary, unit }: SlideCardProps): React.JSX.Element {
  const number = summary.index + 1;
  return (
    <article
      aria-label={`Diapositiva ${number}`}
      className="flex aspect-video w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-background p-4 sm:p-6"
    >
      {summary.state === 'hidden' ? (
        <p className="inline-flex w-fit items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-xs font-medium text-foreground">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          Oculta
        </p>
      ) : null}
      {unit === null ? (
        <p role="status">Cargando diapositiva…</p>
      ) : (
        <SlideBlocks unit={unit} number={number} />
      )}
    </article>
  );
}

function PresentationView(props: {
  readonly reading: Presentation;
  readonly slides: readonly SlideSummary[];
}): React.JSX.Element {
  const { reading, slides } = props;
  const { index } = reading.selection;
  const summary = slides[index];
  const go = (target: number): void => reading.select({ index: target, offset: 0 });
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        Solo el texto de cada diapositiva: sin imágenes, animaciones ni notas.
      </p>
      <UnitNavigation
        label="Diapositivas"
        status={`Diapositiva ${index + 1} de ${slides.length}${summary?.state === 'hidden' ? ' · Oculta' : ''}`}
        hasPrevious={index > 0}
        hasNext={index < slides.length - 1}
        previous={() => go(index - 1)}
        next={() => go(index + 1)}
      />
      {summary === undefined ? null : (
        <SlideCard key={index} summary={summary} unit={reading.unit} />
      )}
    </div>
  );
}

function PresentationReading(props: OoxmlReaderProps): React.JSX.Element | null {
  const reading = useOoxmlReading('pptx', props);
  if (reading.preview === null) return null;
  if (reading.preview.slides.length === 0) return <EmptyFileNotice />;
  return <PresentationView reading={reading} slides={reading.preview.slides} />;
}

/** Texto seguro y legible de cada diapositiva; no es un renderer visual de PowerPoint. */
export function PresentationPreview(props: OoxmlReaderProps): React.JSX.Element {
  return <PresentationReading key={props.url} {...props} />;
}
