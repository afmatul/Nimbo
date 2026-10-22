import { Injectable } from '@nestjs/common';

import type { ITextExtractor } from '../../application/ports/i-text-extractor.port';
import { DOCX_PREAMBLE_SECTION, DocxLocation } from '../../domain/docx-location';
import type { Segment } from '../../domain/segment';

import {
  OoxmlPackage,
  attributeOf,
  childNamed,
  childrenOf,
  tagOf,
  textOf,
  type XmlNode,
} from './ooxml-reader';

const DOCUMENT_PART = 'word/document.xml';
const STYLES_PART = 'word/styles.xml';
const VAL = 'w:val';
/** `w:outlineLvl` 0, 1 y 2 = niveles 1 a 3 (D-3). */
const MAX_SECTION_OUTLINE_LEVEL = 2;
const HEADING_STYLE_NAME = /^heading [1-3]$/i;
/** Lo que no es texto del cuerpo: dibujos y cuadros de texto (que además vienen repetidos en `mc:Fallback`). */
const SKIPPED_TAGS = new Set(['w:drawing', 'w:pict', 'mc:AlternateContent', 'w:del', 'w:moveFrom']);
const RUN_TEXT: Readonly<Record<string, string>> = { 'w:tab': '\t', 'w:br': '\n', 'w:cr': '\n' };

function isSectionOutlineLevel(value: string | undefined): boolean {
  const level = Number(value);
  return (
    value !== undefined &&
    Number.isInteger(level) &&
    level >= 0 &&
    level <= MAX_SECTION_OUTLINE_LEVEL
  );
}

/** `w:val` del hijo `tag` de `node`, si ambos existen. */
function childValue(node: XmlNode | undefined, tag: string): string | undefined {
  const child = node === undefined ? undefined : childNamed(node, tag);
  return child === undefined ? undefined : attributeOf(child, VAL);
}

/** `styleId` de los estilos de párrafo de título 1–3, por nombre («heading N») o por nivel de esquema. */
function headingStyleIds(styles: readonly XmlNode[] | undefined): ReadonlySet<string> {
  const root = styles?.find((node) => tagOf(node) === 'w:styles');
  const ids = new Set<string>();
  for (const style of root === undefined ? [] : childrenOf(root)) {
    const id = attributeOf(style, 'w:styleId');
    const name = childValue(style, 'w:name') ?? '';
    const outline = childValue(childNamed(style, 'w:pPr'), 'w:outlineLvl');
    if (id !== undefined && (HEADING_STYLE_NAME.test(name) || isSectionOutlineLevel(outline))) {
      ids.add(id);
    }
  }
  return ids;
}

/** Un párrafo abre sección si su nivel de esquema propio es 0–2 o, si no lo fija, si su estilo es de título. */
function opensSection(paragraph: XmlNode, headingStyles: ReadonlySet<string>): boolean {
  const properties = childNamed(paragraph, 'w:pPr');
  const outline = childValue(properties, 'w:outlineLvl');
  if (outline !== undefined) return isSectionOutlineLevel(outline);
  const style = childValue(properties, 'w:pStyle');
  return style !== undefined && headingStyles.has(style);
}

/** Texto de un párrafo: `w:t`, tabuladores y saltos de sus corridas, en orden. */
function paragraphText(node: XmlNode): string {
  const tag = tagOf(node);
  if (tag === undefined || SKIPPED_TAGS.has(tag)) return '';
  const runText = RUN_TEXT[tag];
  if (runText !== undefined) return runText;
  if (tag === 'w:t')
    return childrenOf(node)
      .map((child) => textOf(child) ?? '')
      .join('');
  return childrenOf(node).map(paragraphText).join('');
}

/** Párrafos del cuerpo en orden de lectura, incluidos los de tablas y controles de contenido. */
function* bodyParagraphs(nodes: readonly XmlNode[]): Generator<XmlNode> {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (tag === undefined || SKIPPED_TAGS.has(tag)) continue;
    if (tag === 'w:p') yield node;
    else yield* bodyParagraphs(childrenOf(node));
  }
}

/**
 * Extractor de `.docx` (D-3): lee `word/document.xml`; un párrafo con estilo de título 1–3 (por `styles.xml`) o nivel
 * de esquema 0–2 abre una sección nueva (la 0 es lo anterior al primero) y cada párrafo con texto es un segmento
 * numerado dentro de su sección, desde 1. Sin encabezados, pies, notas ni cuadros de texto.
 */
@Injectable()
export class DocxExtractor implements ITextExtractor {
  readonly kind = 'docx';

  extract(content: Buffer): Promise<readonly Segment[]> {
    return Promise.resolve().then(() => this.read(content));
  }

  private read(content: Buffer): readonly Segment[] {
    const docx = OoxmlPackage.read(content, [DOCUMENT_PART, STYLES_PART]);
    const headingStyles = headingStyleIds(docx.optionalPart(STYLES_PART));
    const segments: Segment[] = [];
    let section = DOCX_PREAMBLE_SECTION;
    let paragraph = 0;
    for (const node of bodyParagraphs(docx.part(DOCUMENT_PART))) {
      const text = paragraphText(node);
      if (text.trim().length === 0) continue;
      if (opensSection(node, headingStyles)) [section, paragraph] = [section + 1, 0];
      paragraph += 1;
      segments.push({ text, location: DocxLocation.paragraph(section, paragraph) });
    }
    return segments;
  }
}
