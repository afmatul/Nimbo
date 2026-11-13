'use client';

import * as React from 'react';

/**
 * Variable de `:root` con el alto que tapa el panel de cargas desde el pie de la ventana (margen incluido); el `main`
 * del layout la suma a su relleno inferior, así el final de la página (última fila, «Cargar más») queda por encima.
 */
export const UPLOAD_PANEL_RESERVE_VARIABLE = '--upload-panel-reserve';

/** Distancia desde el borde superior del panel hasta el pie de la ventana. */
function reserveOf(panel: HTMLElement): string {
  const top = panel.getBoundingClientRect().top;
  return `${String(Math.max(0, Math.ceil(window.innerHeight - top)))}px`;
}

/**
 * Mientras el panel fijo está montado, publica lo que tapa en `--upload-panel-reserve` y lo sigue al cambiar su alto o
 * la ventana; al desmontarse la retira. Reemplaza al espaciador que iba fuera del layout y cortaba la barra lateral.
 */
export function useBottomReserve(ref: React.RefObject<HTMLElement | null>, active: boolean): void {
  React.useLayoutEffect(() => {
    const panel = ref.current;
    if (!active || panel === null) return undefined;
    const root = document.documentElement;
    const update = (): void =>
      root.style.setProperty(UPLOAD_PANEL_RESERVE_VARIABLE, reserveOf(panel));
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(panel);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      root.style.removeProperty(UPLOAD_PANEL_RESERVE_VARIABLE);
    };
  }, [ref, active]);
}
