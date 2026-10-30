'use client';

import * as React from 'react';

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
/** Lo que se deja libre a la izquierda para el contenido de la página. */
const MIN_PAGE_WIDTH = 360;
export const KEYBOARD_STEP = 24;

/** Variable de `:root` con el ancho vigente: el contenido y el panel de cargas se corren por ella para no quedar debajo. */
const WIDTH_VARIABLE = '--agent-panel-width';

export interface AgentPanelWidth {
  readonly width: number;
  readonly min: number;
  readonly max: number;
  readonly resizeTo: (width: number) => void;
}

const maxWidthOf = (): number =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - MIN_PAGE_WIDTH));

/**
 * Ancho ajustable del panel del agente como complemento (≥ 320 px). Mientras `enabled`, publica el ancho en
 * `--agent-panel-width`; al cerrarse o pasar a hoja, la variable se retira y las cargas vuelven a su sitio.
 */
export function useAgentPanelWidth(enabled: boolean): AgentPanelWidth {
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  React.useLayoutEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    root.style.setProperty(WIDTH_VARIABLE, `${String(width)}px`);
    return () => {
      root.style.removeProperty(WIDTH_VARIABLE);
    };
  }, [enabled, width]);
  const resizeTo = React.useCallback((next: number) => {
    setWidth(Math.round(Math.min(maxWidthOf(), Math.max(MIN_WIDTH, next))));
  }, []);
  return { width, min: MIN_WIDTH, max: MAX_WIDTH, resizeTo };
}
