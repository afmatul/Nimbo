import type { Provider, Type } from '@nestjs/common';

import { ExtractorRegistry } from '../../application/extractor-registry';
import {
  I_TEXT_EXTRACTORS,
  type ITextExtractor,
} from '../../application/ports/i-text-extractor.port';

import { DocxExtractor } from './docx.extractor';
import { PlainTextExtractor } from './plain-text.extractor';

/** Extractores registrados: sumar un formato es una línea aquí (PDF en 019 T-04; `.xlsx`/`.pptx` en T-12). */
const TEXT_EXTRACTORS: readonly Type<ITextExtractor>[] = [DocxExtractor, PlainTextExtractor];

/**
 * Proveedores de la extracción que comparten los módulos `api` (qué es indexable) y `worker` (extraer): cada
 * extractor, su lista bajo `I_TEXT_EXTRACTORS` y el `ExtractorRegistry`. Las dependencias propias de un extractor
 * (p. ej. `ICommandRunner` del PDF) se registran junto a él aquí.
 */
export const EXTRACTOR_PROVIDERS: readonly Provider[] = [
  ...TEXT_EXTRACTORS,
  {
    provide: I_TEXT_EXTRACTORS,
    useFactory: (...extractors: ITextExtractor[]): readonly ITextExtractor[] => extractors,
    inject: [...TEXT_EXTRACTORS],
  },
  ExtractorRegistry,
];
