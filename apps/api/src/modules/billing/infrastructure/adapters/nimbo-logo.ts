import { CIELO_SERENO } from './invoice-pdf-theme';

/** Lado del lienzo del ícono de la web (`apps/web/src/app/icon.svg`, `viewBox="0 0 418 418"`). */
const ICON_CANVAS = 418;

/** Las nubes del ícono como `[cx, cy, r]` y su base `[x, y, ancho, alto]`, en coordenadas del lienzo. */
const CLOUD_CIRCLES: readonly (readonly [number, number, number])[] = [
  [258, 170, 110],
  [122, 206, 78],
  [348, 246, 60],
  [69, 292, 67],
  [351, 294, 65],
];
const CLOUD_BASE = [69, 200, 282, 159] as const;
const SPARKLE_PATH = 'M210 122Q221 213 315 224Q221 235 210 328Q199 235 105 224Q199 213 210 122Z';

/** Dónde y de qué tamaño (lado en puntos) se dibuja el ícono. */
export interface LogoPlacement {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * El ícono de Nimbo (nube con destello) con primitivas vectoriales, sin imágenes (ADR-0028): las mismas figuras del
 * `icon.svg` de la web, escaladas al tamaño pedido.
 */
export function drawNimboLogo(pdf: PDFKit.PDFDocument, { x, y, size }: LogoPlacement): void {
  pdf.save();
  pdf.translate(x, y).scale(size / ICON_CANVAS);
  for (const [cx, cy, radius] of CLOUD_CIRCLES) pdf.circle(cx, cy, radius);
  pdf.rect(...CLOUD_BASE).fill(CIELO_SERENO.brand);
  pdf.path(SPARKLE_PATH).fill(CIELO_SERENO.primaryForeground);
  pdf.restore();
}
