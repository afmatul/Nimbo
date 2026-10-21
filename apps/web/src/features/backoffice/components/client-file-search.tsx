'use client';

import { clientFilesQuerySchema, REQUIRED_REASON, toFieldIssues } from '@nimbo/contracts';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { backofficeFieldMessage } from '../../../lib/error-catalog';

import { EmailSearchField } from './email-search-field';
import { FieldMessage } from './field-message';

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
        <EmailSearchField
          ref={inputRef}
          id={INPUT_ID}
          value={value}
          error={error !== null}
          aria-describedby={error === null ? HELP_ID : `${HELP_ID} ${ERROR_ID}`}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit">Buscar</Button>
      </div>
      <p id={HELP_ID} className="mt-1.5 text-sm text-muted-foreground">
        Escribe el correo completo con el que el cliente inicia sesión.
      </p>
      {error === null ? null : <FieldMessage id={ERROR_ID} message={error} />}
    </form>
  );
}
