import type { SourceLocation } from './source-location';

/**
 * Trozo de texto con una sola ubicación, en orden de lectura: la salida de todo `ITextExtractor` (un párrafo de
 * `.docx`, una línea de texto, el texto de una página de PDF, una hoja o una diapositiva). El `Chunker` decide cómo
 * agruparlos en fragmentos; el extractor no corta ni une.
 */
export interface Segment {
  readonly text: string;
  readonly location: SourceLocation;
}
