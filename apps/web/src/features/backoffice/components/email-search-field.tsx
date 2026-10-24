import { Search } from 'lucide-react';
import type * as React from 'react';

import { Input, type InputProps } from '../../../components/ui/input';

export interface EmailSearchFieldProps extends InputProps {
  /** El campo: la pantalla le devuelve el foco al limpiar la búsqueda. */
  readonly ref?: React.Ref<HTMLInputElement>;
}

/**
 * Campo de correo con la lupa de las búsquedas del backoffice (mockups `backoffice/soporte` y `backoffice/admin`):
 * `type="search"`, teclado de correo y sin autocompletar. Lo usan la búsqueda de Soporte y la de cuentas.
 */
export function EmailSearchField({ ref, ...input }: EmailSearchFieldProps): React.JSX.Element {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={ref}
        type="search"
        inputMode="email"
        autoComplete="off"
        placeholder="nombre@dominio.com"
        className="pl-9"
        {...input}
      />
    </div>
  );
}
