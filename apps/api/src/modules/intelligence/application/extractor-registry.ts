import { Inject, Injectable } from '@nestjs/common';
import type { FileKind } from '@nimbo/contracts';

import { NotIndexableError } from '../domain/errors';

import { I_TEXT_EXTRACTORS, type ITextExtractor } from './ports/i-text-extractor.port';

/**
 * Registro tipo → extractor (patrón Registry del diagrama M6). Es la única fuente de «qué es indexable»: un tipo sin
 * extractor (imágenes, otros) no entra a la cola (CA-6) y sumar `.xlsx`/`.pptx` es registrar dos extractores (OCP).
 */
@Injectable()
export class ExtractorRegistry {
  private readonly byKind: ReadonlyMap<FileKind, ITextExtractor>;

  constructor(@Inject(I_TEXT_EXTRACTORS) extractors: readonly ITextExtractor[]) {
    const byKind = new Map<FileKind, ITextExtractor>();
    for (const extractor of extractors) {
      if (byKind.has(extractor.kind)) {
        throw new Error(`Hay dos extractores registrados para «${extractor.kind}»`);
      }
      byKind.set(extractor.kind, extractor);
    }
    this.byKind = byKind;
  }

  supports(kind: FileKind): boolean {
    return this.byKind.has(kind);
  }

  /** Extractor del tipo; un tipo sin extractor no se puede indexar (CA-5). */
  forKind(kind: FileKind): ITextExtractor {
    const extractor = this.byKind.get(kind);
    if (extractor === undefined) throw new NotIndexableError('formato_no_soportado');
    return extractor;
  }
}
