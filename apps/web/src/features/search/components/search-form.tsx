'use client';

import { FILE_NAME_MAX_LENGTH } from '@nimbo/contracts';
import { Search as SearchIcon, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';

const FIELD_LABEL = 'Nombre del archivo o carpeta';
const HELP = 'Se buscan todas las palabras que escribas, en cualquier orden.';

export interface SearchFormProps {
  /** Texto de la dirección; el campo arranca con él (la vista monta un formulario nuevo al cambiarlo). */
  readonly initialText: string;
  /** `false` si el texto queda vacío y no se buscó (CA-6). */
  readonly onSubmit: (text: string) => boolean;
}

function ClearButton({ onClear }: { readonly onClear: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Borrar el texto"
      onClick={onClear}
      className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/** Campo de 44 px y letra de 16 px (iOS no amplía), con el ícono y «Borrar el texto» dentro. */
function SearchField({
  text,
  onText,
  inputRef,
}: {
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  const clear = (): void => {
    onText('');
    inputRef.current?.focus();
  };
  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-secondary-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id="buscar-texto"
        type="search"
        value={text}
        maxLength={FILE_NAME_MAX_LENGTH}
        placeholder="informe camión"
        aria-describedby="buscar-ayuda"
        onChange={(event) => onText(event.target.value)}
        className="flex h-11 w-full rounded-md border border-input bg-card pr-11 pl-10 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text === '' ? null : <ClearButton onClear={clear} />}
    </div>
  );
}

/**
 * Formulario de búsqueda (mockup `entrada`, decisión 2): busca al enviar, no mientras se escribe. Con el foco al entrar
 * (CA-12); enviar vacío o solo espacios no busca y devuelve el foco al campo (CA-6).
 */
export function SearchForm({ initialText, onSubmit }: SearchFormProps): React.JSX.Element {
  const [text, setText] = React.useState(initialText);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => inputRef.current?.focus(), []);
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!onSubmit(text)) inputRef.current?.focus();
  };
  return (
    <form
      role="search"
      aria-label="Buscar archivos y carpetas"
      onSubmit={submit}
      className="space-y-1.5"
    >
      <Label htmlFor="buscar-texto">{FIELD_LABEL}</Label>
      <div className="flex gap-2">
        <SearchField text={text} onText={setText} inputRef={inputRef} />
        <Button type="submit">Buscar</Button>
      </div>
      <p id="buscar-ayuda" className="text-sm text-secondary-foreground">
        {HELP}
      </p>
    </form>
  );
}
