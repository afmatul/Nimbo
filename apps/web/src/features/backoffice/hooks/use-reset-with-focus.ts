'use client';

import * as React from 'react';

export interface ResetWithFocus {
  /** Primer campo del formulario: recibe el foco tras vaciarlo. */
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  /** `key` del formulario: cambia en cada vaciado. */
  readonly formKey: number;
  readonly reset: () => void;
}

/**
 * Vacía un formulario no controlado por `react-hook-form` (lo vuelve a montar con `formKey`) y devuelve el foco a su
 * campo: el botón que lo pidió desaparece. «Limpiar búsqueda» de Soporte y de cuentas. El alta interna no lo usa:
 * `react-hook-form` vacía y enfoca por sí mismo (`useResetAndFocus` en `use-enroll-form.ts`).
 */
export function useResetWithFocus(onReset: () => void): ResetWithFocus {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [resets, setResets] = React.useState(0);
  React.useEffect(() => {
    if (resets > 0) inputRef.current?.focus();
  }, [resets]);
  const reset = (): void => {
    onReset();
    setResets((previous) => previous + 1);
  };
  return { inputRef, formKey: resets, reset };
}
