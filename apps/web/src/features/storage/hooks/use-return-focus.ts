'use client';

import * as React from 'react';

import { EXPLORER_HEADING_ID } from '../components/file-explorer';
import { ROW_CONTROL_SELECTOR } from '../components/file-row-menu';
import { rowIdOf } from '../components/node-rows';

import type { FolderListing } from './use-folder-contents';

/** Control de la fila del archivo si sigue en la lista; si no, el encabezado del explorador. */
function returnFocusTarget(fileId: string): HTMLElement | null {
  const row = document.getElementById(rowIdOf(fileId));
  return (
    row?.querySelector<HTMLElement>(ROW_CONTROL_SELECTOR) ??
    document.getElementById(EXPLORER_HEADING_ID)
  );
}

/**
 * Vuelta acotada de la vista previa (017 §6, plan §2.5): espera el listado de la ubicación y enfoca una sola vez la fila
 * pedida o el encabezado. No recupera orden, páginas ni desgloses: la ubicación se abre como nueva.
 */
export function useReturnFocus(status: FolderListing['status'], fileId: string | null): void {
  // Solo el `?foco=` con el que se monta: volver desde la vista previa siempre monta la ubicación de nuevo.
  const pending = React.useRef(fileId);
  React.useEffect(() => {
    if (pending.current === null || status === 'loading') return;
    returnFocusTarget(pending.current)?.focus();
    pending.current = null;
  }, [status]);
}
