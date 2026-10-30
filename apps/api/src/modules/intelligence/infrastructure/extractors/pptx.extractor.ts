import { Injectable } from '@nestjs/common';

import type { ITextExtractor } from '../../application/ports/i-text-extractor.port';
import { NotIndexableError } from '../../domain/errors';
import type { Segment } from '../../domain/segment';
import { SlideLocation } from '../../domain/slide-location';

import {
  OoxmlPackage,
  attributeOf,
  childNamed,
  childrenNamed,
  childrenOf,
  elementText,
  relationshipsPathOf,
  tagOf,
  type XmlNode,
} from './ooxml-reader';

const PRESENTATION_PART = 'ppt/presentation.xml';
/** PowerPoint, LibreOffice y Google escriben las diapositivas aquí; las notas viven en otra carpeta y no se leen. */
const SLIDE_PARTS = /^ppt\/slides\/[^/]+\.xml$/;
/** Lo que repite contenido de otra rama (`mc:Fallback` copia lo de `mc:Choice`, por lo general como imagen). */
const SKIPPED_TAGS = new Set(['mc:Fallback']);
/** Elementos de un párrafo de DrawingML con texto: corridas y campos (número de diapositiva, fecha). */
const TEXT_RUN_TAGS = new Set(['a:r', 'a:fld']);
const LINE_SEPARATOR = '\n';

const hasText = (text: string): boolean => text.trim().length > 0;

/** Texto de un párrafo `a:p`: sus corridas y campos en orden; `a:br` es un salto de línea. */
function paragraphText(paragraph: XmlNode): string {
  return childrenOf(paragraph)
    .map((node) => {
      const tag = tagOf(node) ?? '';
      if (tag === 'a:br') return LINE_SEPARATOR;
      return TEXT_RUN_TAGS.has(tag) ? elementText(childNamed(node, 'a:t')) : '';
    })
    .join('');
}

/** Párrafos de las formas, grupos y tablas del árbol, en orden; las imágenes no tienen párrafos. */
function* shapeParagraphs(nodes: readonly XmlNode[]): Generator<XmlNode> {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (tag === undefined || SKIPPED_TAGS.has(tag)) continue;
    if (tag === 'a:p') yield node;
    else yield* shapeParagraphs(childrenOf(node));
  }
}

function slideText(pptx: OoxmlPackage, path: string): string {
  const commonSlideData = childrenNamed(pptx.root(path, 'p:sld'), 'p:cSld');
  const paragraphs = [...shapeParagraphs(commonSlideData)];
  return paragraphs.map(paragraphText).filter(hasText).join(LINE_SEPARATOR);
}

/** Rutas de las diapositivas en el orden de `p:sldIdLst`, que es el de la presentación (no el de los archivos). */
function slidePaths(pptx: OoxmlPackage): readonly string[] {
  const slideIds = childNamed(pptx.root(PRESENTATION_PART, 'p:presentation'), 'p:sldIdLst');
  const relationships = pptx.relationships(PRESENTATION_PART);
  return childrenNamed(slideIds, 'p:sldId').map((slideId) => {
    const relationship = relationships.get(attributeOf(slideId, 'r:id') ?? '');
    if (relationship === undefined) throw new NotIndexableError('formato_no_soportado');
    return relationship.path;
  });
}

/**
 * Extractor de `.pptx` (CA-6, RN-2): cada diapositiva con texto es un segmento con su número según el orden de
 * `presentation.xml` (desde 1; las que no tienen texto conservan su número). Lee el texto de las formas, grupos y
 * tablas de la diapositiva; no lee imágenes, notas del orador ni el texto de patrones y diseños.
 */
@Injectable()
export class PptxExtractor implements ITextExtractor {
  readonly kind = 'pptx';

  extract(content: Buffer): Promise<readonly Segment[]> {
    return Promise.resolve().then(() => this.read(content));
  }

  private read(content: Buffer): readonly Segment[] {
    const pptx = OoxmlPackage.read(content, [
      PRESENTATION_PART,
      relationshipsPathOf(PRESENTATION_PART),
      SLIDE_PARTS,
    ]);
    return slidePaths(pptx)
      .map((path, index) => ({ number: index + 1, text: slideText(pptx, path) }))
      .filter(({ text }) => hasText(text))
      .map(({ number, text }) => ({ text, location: SlideLocation.slide(number) }));
  }
}
