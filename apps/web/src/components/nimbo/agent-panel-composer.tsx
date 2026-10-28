'use client';

import { ArrowUp } from 'lucide-react';
import * as React from 'react';

import { formatCount } from '../../lib/format-plan';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

/** Campo apagado (CA-3): marcador y motivo en texto visible, no solo en el marcador. */
export interface ComposerLock {
  readonly placeholder: string;
  readonly reason: string;
}

export interface AgentPanelComposerProps {
  /** Máximo de caracteres de `GET /agent/status` (RN-1); `null` antes de leerlo. */
  readonly maxChars: number | null;
  /** `null` con el campo activo. */
  readonly lock: ComposerLock | null;
  /** Envía la pregunta; `false` si no se envió (vacía, larga o ya hay una en curso) y lo escrito se conserva. */
  readonly onAsk: (question: string) => boolean;
}

const QUESTION_ID = 'agente-pregunta';
const COUNT_ID = 'agente-pregunta-cuenta';
const LOCK_ID = 'agente-pregunta-motivo';

interface ComposerFootProps {
  readonly lock: ComposerLock | null;
  readonly length: number;
  readonly maxChars: number | null;
}

function ComposerFoot({ lock, length, maxChars }: ComposerFootProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs',
        lock === null ? 'text-muted-foreground' : 'text-secondary-foreground',
      )}
    >
      {lock !== null && <span id={LOCK_ID}>{lock.reason}</span>}
      <span id={COUNT_ID} className="ml-auto tabular-nums">
        <span className="sr-only">Caracteres: </span>
        {formatCount(length)}
        {maxChars !== null && ` / ${formatCount(maxChars)}`}
      </span>
    </div>
  );
}

interface QuestionFieldProps {
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
  readonly lock: ComposerLock | null;
}

function QuestionField({ draft, onDraftChange, lock }: QuestionFieldProps): React.JSX.Element {
  return (
    <div className="flex items-end gap-2">
      <label htmlFor={QUESTION_ID} className="sr-only">
        Pregunta sobre tus documentos
      </label>
      <textarea
        id={QUESTION_ID}
        rows={2}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        disabled={lock !== null}
        placeholder={lock?.placeholder ?? 'Pregunta sobre tus documentos…'}
        aria-describedby={lock === null ? COUNT_ID : `${LOCK_ID} ${COUNT_ID}`}
        className="min-h-12 min-w-0 flex-1 resize-none border-0 bg-transparent py-1 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="submit"
        size="icon"
        aria-label="Enviar pregunta"
        disabled={lock !== null}
        className="shrink-0"
      >
        <ArrowUp className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * Cuadro de la pregunta (020b CA-3, CA-17): tarjeta clara dentro del panel, con contador de caracteres y el pie de
 * privacidad. Los estados de error del campo (CA-7) se suman en T-05.
 */
export function AgentPanelComposer({
  maxChars,
  lock,
  onAsk,
}: AgentPanelComposerProps): React.JSX.Element {
  const [draft, setDraft] = React.useState('');
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (onAsk(draft)) setDraft('');
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="sticky bottom-0 grid gap-2.5 border-t border-agent-tag bg-agent-bg px-4 pt-3 pb-4"
    >
      <div
        className={cn(
          'grid gap-1 rounded-lg border border-input bg-card py-2 pr-2 pl-3 text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-live',
          lock !== null && 'bg-muted',
        )}
      >
        <QuestionField draft={draft} onDraftChange={setDraft} lock={lock} />
        <ComposerFoot lock={lock} length={draft.length} maxChars={maxChars} />
      </div>
      <p className="text-xs leading-5">
        Cada pregunta es independiente: no guardamos tus preguntas ni las respuestas. El agente solo
        lee los archivos a los que tienes acceso.
      </p>
    </form>
  );
}
