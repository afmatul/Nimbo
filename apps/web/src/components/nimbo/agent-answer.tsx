import type { AgentCitationEvent } from '@nimbo/contracts';
import { CircleAlert, Sparkles } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../ui/alert';
import { Button } from '../ui/button';

import { CitationChip } from './citation-chip';

/** Citas recibidas en eventos `citation`, indexadas por su `ordinal` (el `n` de `[n]` en el texto). */
export type AgentCitationsByOrdinal = Readonly<Record<number, AgentCitationEvent>>;

export interface AgentAnswerProps {
  readonly question: string;
  /** Texto acumulado de los eventos `delta`, con sus marcas `[n]`. */
  readonly text: string;
  readonly citations: AgentCitationsByOrdinal;
  readonly isStreaming: boolean;
  readonly onStop?: () => void;
}

/** Captura cada marca `[n]` como parte propia al partir el texto. */
const CITATION_MARK = /(\[\d+\])/;

/** Un párrafo termina en una línea en blanco. */
const PARAGRAPH_BREAK = /\n{2,}/;

/**
 * Un párrafo con sus marcas `[n]` ya resueltas: el texto sin ellas y, aparte, las citas que lo respaldan sin repetir
 * (mismo archivo y misma ubicación). Un `[n]` sin cita recibida queda como texto: la web no construye citas (RN-2).
 */
function splitParagraph(
  paragraph: string,
  citations: AgentCitationsByOrdinal,
): { readonly body: string; readonly cited: readonly AgentCitationEvent[] } {
  const cited = new Map<string, AgentCitationEvent>();
  const body = paragraph
    .split(CITATION_MARK)
    .map((part) => {
      const citation = CITATION_MARK.test(part) ? citations[Number(part.slice(1, -1))] : undefined;
      if (citation === undefined) return part;
      const key = `${citation.fileId}|${citation.label}`;
      if (!cited.has(key)) cited.set(key, citation);
      return '';
    })
    .join('');
  return { body, cited: [...cited.values()] };
}

/**
 * Parte el texto en párrafos de React (020b D-6, CA-13): nunca se interpreta como HTML ni Markdown. Las citas no van
 * entre las frases: se indican una sola vez al final de cada párrafo.
 */
function renderAnswerText(
  text: string,
  citations: AgentCitationsByOrdinal,
  cursor: React.ReactNode,
): React.ReactNode[] {
  const paragraphs = text.split(PARAGRAPH_BREAK);
  return paragraphs.map((paragraph, index) => {
    const { body, cited } = splitParagraph(paragraph, citations);
    return (
      <p key={index} className="whitespace-pre-wrap break-words text-sm leading-7">
        {body}
        {cited.map((citation) => (
          <CitationChip key={`${citation.fileId}|${citation.label}`} citation={citation} />
        ))}
        {index === paragraphs.length - 1 && cursor}
      </p>
    );
  });
}

function StreamingCursor(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-agent-accent align-middle motion-reduce:animate-none"
    />
  );
}

function LiveIndicator(): React.JSX.Element {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-xs font-semibold normal-case tracking-normal"
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-agent-accent motion-reduce:animate-none"
      />
      Escribiendo…
    </span>
  );
}

/** Aviso de CA-6 sobre una tarjeta clara: el tono `warning` al 10 % solo es AA sobre `card`, no sobre `agent-bg`. */
function UncertainLocationNotice(): React.JSX.Element {
  return (
    <div className="rounded-md bg-card">
      <Alert variant="warning" className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">La ubicación de esta cita es aproximada</p>
          <p className="text-foreground">Abre el archivo y compruébalo antes de usarlo.</p>
        </div>
      </Alert>
    </div>
  );
}

/**
 * Una pregunta y su respuesta en el panel del agente, en texto plano con sus citas (020b CA-3, CA-6, CA-13). Va
 * dentro del `role="log"` del panel, que anuncia lo nuevo con `aria-live="polite"`.
 */
export function AgentAnswer({
  question,
  text,
  citations,
  isStreaming,
  onStop,
}: AgentAnswerProps): React.JSX.Element {
  const hasUncertain = Object.values(citations).some((citation) => !citation.isCertain);
  return (
    <div className="grid gap-3 text-agent-text">
      <p className="ml-8 justify-self-end whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-agent-tag px-3.5 py-2.5 text-sm">
        <span className="sr-only">Preguntaste: </span>
        {question}
      </p>
      <article aria-label="Respuesta del agente" className="grid gap-2.5">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-agent-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Respuesta
          {isStreaming && <LiveIndicator />}
        </p>
        {renderAnswerText(text, citations, isStreaming && <StreamingCursor />)}
        {hasUncertain && <UncertainLocationNotice />}
        {isStreaming && onStop && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start text-foreground"
            onClick={onStop}
          >
            Detener
          </Button>
        )}
      </article>
    </div>
  );
}
