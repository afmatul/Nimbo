import { buildZip, escapeXml } from './docx-fixture';

/**
 * Generador de `.pptx` mínimos para pruebas (019 D-5): sin binarios versionados. Cada diapositiva se escribe en
 * `ppt/slides/slideN.xml` según su posición en el arreglo, pero el orden de la presentación lo da `order`, para probar
 * que el extractor numera por `presentation.xml` y no por el nombre del archivo.
 */
export interface PptxFixtureSlide {
  /** Formas de texto: una por arreglo, un párrafo por cadena. */
  readonly shapes: readonly (readonly string[])[];
  /** Tabla en un marco gráfico: una fila por arreglo, una celda por cadena. */
  readonly table?: readonly (readonly string[])[];
  /** Imagen con texto alternativo: no es texto de la diapositiva. */
  readonly pictureDescription?: string;
  /** Notas del orador, en su propia parte: no se leen. */
  readonly notes?: string;
}

const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NAMESPACES = `xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}"`;
/** Firma PNG: una imagen de verdad no es XML y no debe llegar al analizador. */
const PNG_BYTES = '\u0089PNG\r\n\u001a\n';

const paragraphXml = (text: string): string =>
  `<a:p><a:r><a:rPr lang="es-GT"/><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;

function shapeXml(paragraphs: readonly string[]): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Forma"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paragraphs.map(paragraphXml).join('')}</p:txBody></p:sp>`;
}

function tableXml(rows: readonly (readonly string[])[]): string {
  const cellXml = (text: string): string =>
    `<a:tc><a:txBody><a:bodyPr/>${paragraphXml(text)}</a:txBody></a:tc>`;
  const rowXml = (cells: readonly string[]): string =>
    `<a:tr>${cells.map(cellXml).join('')}</a:tr>`;
  return `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${rows.map(rowXml).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

function pictureXml(description: string): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Imagen" descr="${escapeXml(description)}"/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill></p:pic>`;
}

function slideXml(slide: PptxFixtureSlide): string {
  const table = slide.table === undefined ? '' : tableXml(slide.table);
  const picture =
    slide.pictureDescription === undefined ? '' : pictureXml(slide.pictureDescription);
  return `${XML_DECLARATION}<p:sld ${NAMESPACES}><p:cSld><p:spTree>${slide.shapes.map(shapeXml).join('')}${table}${picture}</p:spTree></p:cSld></p:sld>`;
}

function notesXml(notes: string): string {
  return `${XML_DECLARATION}<p:notes ${NAMESPACES}><p:cSld><p:spTree>${shapeXml([notes])}</p:spTree></p:cSld></p:notes>`;
}

function slideRelsXml(file: number): string {
  return `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELS_NS}"><Relationship Id="rIdImage" Type="${R_NS}/image" Target="../media/image1.png"/><Relationship Id="rIdNotes" Type="${R_NS}/notesSlide" Target="../notesSlides/notesSlide${file}.xml"/></Relationships>`;
}

function presentationXml(order: readonly number[]): string {
  const ids = order.map((file, index) => `<p:sldId id="${256 + index}" r:id="rId${file + 1}"/>`);
  return `${XML_DECLARATION}<p:presentation ${NAMESPACES}><p:sldIdLst>${ids.join('')}</p:sldIdLst></p:presentation>`;
}

function presentationRelsXml(slides: readonly PptxFixtureSlide[]): string {
  const rels = slides.map(
    (_slide, index) =>
      `<Relationship Id="rId${index + 1}" Type="${R_NS}/slide" Target="slides/slide${index + 1}.xml"/>`,
  );
  return `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_RELS_NS}">${rels.join('')}</Relationships>`;
}

function slideParts(slide: PptxFixtureSlide, index: number): [string, string][] {
  const file = index + 1;
  const notes: [string, string][] =
    slide.notes === undefined
      ? []
      : [[`ppt/notesSlides/notesSlide${file}.xml`, notesXml(slide.notes)]];
  return [
    [`ppt/slides/slide${file}.xml`, slideXml(slide)],
    [`ppt/slides/_rels/slide${file}.xml.rels`, slideRelsXml(file)],
    ...notes,
  ];
}

/**
 * Arma un `.pptx`; `order` lista, por posición en la presentación, el índice de la diapositiva en `slides` (por
 * defecto, el mismo orden).
 */
export function buildPptx(
  slides: readonly PptxFixtureSlide[],
  order: readonly number[] = slides.map((_slide, index) => index),
): Buffer {
  return buildZip({
    'ppt/presentation.xml': presentationXml(order),
    'ppt/_rels/presentation.xml.rels': presentationRelsXml(slides),
    'ppt/media/image1.png': PNG_BYTES,
    ...Object.fromEntries(slides.flatMap(slideParts)),
  });
}
