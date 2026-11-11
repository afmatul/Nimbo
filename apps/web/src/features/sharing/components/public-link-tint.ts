// Clases de la página del enlace público que comparten los estados sin ficha y los avisos sobre la ficha.

/**
 * PD-189: sobre advertencia y error el borde `input` del `outline` no llega a 3:1; `secondary-foreground` sí. Va en el
 * contenedor de «Reintentar» y el texto queda en `foreground` aunque el contenedor lo tiña.
 */
export const RETRY_ON_TINT = '[&_button]:border-secondary-foreground [&_button]:text-foreground';
