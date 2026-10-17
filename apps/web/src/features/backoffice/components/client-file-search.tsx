'use client';

import { clientFilesQuerySchema, REQUIRED_REASON, toFieldIssues } from '@nimbo/contracts';
import { AlertCircle, Search } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { backofficeFieldMessage } from '../../../lib/error-catalog';

const INPUT_ID = 'correo-cliente';
const HELP_ID = `${INPUT_ID}-ayuda`;
const ERROR_ID = `${INPUT_ID}-error`;

/** Correo normalizado, o el mensaje del campo si no es un correo completo (los mismos motivos que la API, CA-13). */
function validate(value: string): { readonly email: string } | { readonly error: string } {
  const parsed = clientFilesQuerySchema.safeParse({ email: value });
  if (parsed.success) return { email: parsed.data.email };
  const reason = toFieldIssues(parsed.error)[0]?.reason ?? REQUIRED_REASON;
  return { error: backofficeFieldMessage(reason) };
}

export interface ClientFileSearchProps {
  readonly onSearch: (email: string) => void;
  /** Campo del correo: la pantalla le devuelve el foco al limpiar la búsqueda. */
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
}

/** Lo escrito y su error; al enviar, busca el correo normalizado o deja el foco en el campo con el motivo. */
function useEmailSearch({ onSearch, inputRef }: ClientFileSearchProps) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = validate(value);
    setError('error' in result ? result.error : null);
    if ('email' in result) onSearch(result.email);
    else inputRef.current?.focus();
  };
  return { value, setValue, error, submit };
}

function FieldError({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <p
      id={ERROR_ID}
      className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/**
 * Búsqueda exacta por correo (mockup `backoffice/soporte`, decisiones 1 y 11): «Buscar» es la acción primaria; no busca
 * al teclear ni sugiere cuentas. Un correo incompleto no llega a la API: el campo dice qué falta y recibe el foco.
 */
export function ClientFileSearch({ onSearch, inputRef }: ClientFileSearchProps): React.JSX.Element {
  const { value, setValue, error, submit } = useEmailSearch({ onSearch, inputRef });
  return (
    <form role="search" aria-label="Buscar cliente" noValidate onSubmit={submit} className="mt-5">
      <Label htmlFor={INPUT_ID}>Correo del cliente</Label>
      <div className="mt-1.5 flex max-w-xl gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            id={INPUT_ID}
            type="search"
            inputMode="email"
            autoComplete="off"
            placeholder="nombre@dominio.com"
            className="pl-9"
            value={value}
            error={error !== null}
            aria-describedby={error === null ? HELP_ID : `${HELP_ID} ${ERROR_ID}`}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <Button type="submit">Buscar</Button>
      </div>
      <p id={HELP_ID} className="mt-1.5 text-sm text-muted-foreground">
        Escribe el correo completo con el que el cliente inicia sesión.
      </p>
      {error === null ? null : <FieldError message={error} />}
    </form>
  );
}
