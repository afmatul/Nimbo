'use client';

import { EMAIL_MAX_LENGTH, listAccountsQuerySchema } from '@nimbo/contracts';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';

import { EmailSearchField } from './email-search-field';

const INPUT_ID = 'correo-cuenta';

export interface AccountSearchProps {
  /** Recibe el inicio del correo normalizado como la API (Q-5); `undefined` si el campo quedó vacío. */
  readonly onSearch: (email: string | undefined) => void;
  /** Campo del correo: la pantalla le devuelve el foco al limpiar la búsqueda. */
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * Búsqueda por el inicio del correo (011 CA-1, P-16; mockup `backoffice/admin`, decisión 3): se envía con «Buscar», no
 * al teclear. El largo máximo del campo es el de la API, así que el prefijo siempre es válido.
 */
export function AccountSearch({ onSearch, inputRef }: AccountSearchProps): React.JSX.Element {
  const [value, setValue] = React.useState('');
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSearch(listAccountsQuerySchema.parse({ email: value }).email);
  };
  return (
    <form role="search" aria-label="Buscar cuentas" onSubmit={submit} className="mt-5">
      <Label htmlFor={INPUT_ID}>Buscar por correo</Label>
      <div className="mt-1.5 flex max-w-xl gap-2.5">
        <EmailSearchField
          ref={inputRef}
          id={INPUT_ID}
          maxLength={EMAIL_MAX_LENGTH}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </div>
    </form>
  );
}
