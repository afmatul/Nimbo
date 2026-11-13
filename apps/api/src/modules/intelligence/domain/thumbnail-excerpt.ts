import type { Segment } from './segment';

/** Largo máximo del extracto (la tabla lo acota en 600): lo que cabe en la miniatura de una tarjeta. */
export const THUMBNAIL_EXCERPT_MAX_CHARS = 400;

/**
 * Primeras líneas de un documento para su miniatura: une los segmentos en orden de lectura, colapsa los espacios y
 * corta en el límite de una palabra con «…». Cadena vacía si el documento no tiene texto.
 */
export function thumbnailExcerptOf(
  segments: readonly Segment[],
  maxChars: number = THUMBNAIL_EXCERPT_MAX_CHARS,
): string {
  const text = segments
    .map((segment) => segment.text.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.search(/\s\S*$/);
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
