'use client';

import * as React from 'react';

type AutoFocusHandler = (event: Event) => void;

/** Desde un ítem de menú se vuelve a su disparador (el ⋮): el menú se desmonta al elegir (Radix lo etiqueta con él). */
function openerOf(active: Element | null): HTMLElement | null {
  const menu = active?.closest('[role="menu"]');
  const labelledBy = menu?.getAttribute('aria-labelledby');
  const target = labelledBy ? document.getElementById(labelledBy) : active;
  return target instanceof HTMLElement ? target : null;
}

export interface ReturnFocus {
  readonly onOpenAutoFocus: AutoFocusHandler;
  readonly onCloseAutoFocus: AutoFocusHandler;
}

/**
 * Los diálogos de `sharing` se abren desde un ítem de menú, no desde un `DialogTrigger`: Radix no sabe a quién volver.
 * Al abrir se recuerda el elemento con el foco (el ⋮ de la fila o el botón) y al cerrar vuelve a él (spec 012b CA-7).
 */
export function useReturnFocus(): ReturnFocus {
  const opener = React.useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      opener.current = openerOf(document.activeElement);
    },
    onCloseAutoFocus: (event) => {
      event.preventDefault();
      if (opener.current?.isConnected) opener.current.focus();
    },
  };
}
