'use client';

import { ArrowUp, CircleAlert } from 'lucide-react';
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
  /** Error de la pregunta (CA-7): causa y corrección del catálogo; `null` sin error. */
  readonly error: string | null;
  /** Envía la pregunta; `false` si no se envió (vacía, larga o ya hay una en curso) y lo escrito se conserva. */
  readonly onAsk: (question: string) => boolean;
}

const QUESTION_ID = 'agente-pregunta';
const COUNT_ID = 'agente-pregunta-cuenta';
const LOCK_ID = 'agente-pregunta-motivo';
const ERROR_ID = 'agente-pregunta-error';

/** Ids que describen el campo: error, motivo del bloqueo y contador, en ese orden (mockup). */
function describedByOf(lock: ComposerLock | null, error: string | null): string {
  return [error !== null && ERROR_ID, lock !== null && LOCK_ID, COUNT_ID].filter(Boolean).join(' ');
}

interface ComposerFootProps {
  readonly lock: ComposerLock | null;
  readonly error: string | null;
  readonly length: number;
  readonly maxChars: number | null;
}

function FieldError({ error }: { readonly error: string }): React.JSX.Element {
  return (
    <p id={ERROR_ID} className="flex basis-full items-start gap-1.5 font-semibold text-destructive">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </p>
  );
}

function ComposerFoot({ lock, error, length, maxChars }: ComposerFootProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs',
        lock === null ? 'text-muted-foreground' : 'text-secondary-foreground',
      )}
    >
      {error !== null && <FieldError error={error} />}
      {lock !== null && <span id={LOCK_ID}>{lock.reason}</span>}
      <span
        id={COUNT_ID}
        className={cn('ml-auto tabular-nums', error !== null && 'font-semibold text-destructive')}
      >
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
  readonly error: string | null;
}

function QuestionField({
  draft,
  onDraftChange,
  lock,
  error,
}: QuestionFieldProps): React.JSX.Element {
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
        aria-invalid={error !== null || undefined}
        aria-describedby={describedByOf(lock, error)}
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
 * privacidad. Con la pregunta vacía o larga, el campo se marca inválido con el error del catálogo (CA-7).
 */
export function AgentPanelComposer({
  maxChars,
  lock,
  error,
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
          error !== null && 'border-destructive',
        )}
      >
        <QuestionField draft={draft} onDraftChange={setDraft} lock={lock} error={error} />
        <ComposerFoot lock={lock} error={error} length={draft.length} maxChars={maxChars} />
      </div>
      <p className="text-xs leading-5">
        Cada pregunta es independiente: no guardamos tus preguntas ni las respuestas. El agente solo
        lee los archivos a los que tienes acceso.
      </p>
    </form>
  );
}
