'use client';

import * as React from 'react';

/**
 * Al cerrarse un diálogo sin disparador propio, devuelve el foco al botón que lo abrió (Radix solo lo hace con su
 * `Trigger`); el mismo patrón que la confirmación de cierre de sesión del menú de la cuenta.
 */
export function useReturnFocus(open: boolean): React.RefObject<HTMLButtonElement | null> {
  const ref = React.useRef<HTMLButtonElement>(null);
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return ref;
}
