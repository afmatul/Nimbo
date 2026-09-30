'use client';

import * as React from 'react';

/** `true` si el arrastre trae archivos del sistema (no texto ni enlaces). */
export function isFileDrag(dataTransfer: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  return Array.from(dataTransfer?.types ?? []).includes('Files');
}

function preventFileDrop(event: DragEvent): void {
  if (isFileDrag(event.dataTransfer)) event.preventDefault();
}

/**
 * Impide que el navegador abra un archivo soltado fuera de la zona de arrastre: navegar a él descartaría las cargas
 * de la pestaña (RN-7). Los arrastres sin archivos siguen su curso normal.
 */
export function useFileDropGuard(): void {
  React.useEffect(() => {
    window.addEventListener('dragover', preventFileDrop);
    window.addEventListener('drop', preventFileDrop);
    return () => {
      window.removeEventListener('dragover', preventFileDrop);
      window.removeEventListener('drop', preventFileDrop);
    };
  }, []);
}
