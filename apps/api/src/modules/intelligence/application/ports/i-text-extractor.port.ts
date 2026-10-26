import type { FileKind } from '@nimbo/contracts';

import type { Segment } from '../../domain/segment';

/**
 * Lee el texto de un tipo de archivo (diagrama M6, regla (e) de Art. V.2: `.docx`, `.pdf`, texto y, con RF-31,
 * `.xlsx` y `.pptx`). Devuelve los segmentos en orden de lectura, cada uno con una sola ubicación y sin cortar ni unir
 * (eso es del `Chunker`); omite los que quedan en blanco. Un contenido que no corresponde a `kind` o está dañado
 * lanza `NotIndexableError('formato_no_soportado')`; un paquete que se descomprime por encima del tope,
 * `NotIndexableError('demasiado_grande')`; un PDF sin capa de texto, `NotIndexableError('sin_texto')`. Cualquier
 * otro error es transitorio y lo reintenta la cola. Nunca registra texto ni nombres en bitácora.
 */
export interface ITextExtractor {
  /** Tipo de `archivo.tipo` que sabe leer; uno por extractor. */
  readonly kind: FileKind;
  extract(content: Buffer): Promise<readonly Segment[]>;
}

/** Token de la lista de extractores registrados (`extractors.providers.ts`). */
export const I_TEXT_EXTRACTORS = Symbol('ITextExtractors');
