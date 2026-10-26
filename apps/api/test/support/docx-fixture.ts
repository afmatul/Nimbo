import { strToU8, zipSync, type Zippable } from 'fflate';

/**
 * Generador de `.docx` mínimos para pruebas (019 D-5): sin binarios versionados. Los encabezados usan un `styleId`
 * localizado («Ttulo1», como Word en español) cuyo nombre en `styles.xml` es «heading N», para probar que el extractor
 * lee los estilos y no adivina por el id.
 */
export type DocxFixtureBlock =
  /** Párrafo; con varias cadenas, una corrida (`w:r`) por cadena. `\t` y `\n` se escriben como `w:tab` y `w:br`. */
  | { readonly text: string | readonly string[] }
  /** Párrafo con estilo de título de nivel 1 a 4. */
  | { readonly heading: 1 | 2 | 3 | 4; readonly text: string }
  /** Párrafo con nivel de esquema propio (`w:outlineLvl`, 0 = nivel 1), sin estilo de título. */
  | { readonly outlineLevel: number; readonly text: string }
  /** Tabla: una fila por arreglo, un párrafo por celda. */
  | { readonly table: readonly (readonly string[])[] };

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const HEADING_LEVELS = [1, 2, 3, 4] as const;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/**
 * `[Content_Types].xml` genérico para los paquetes de `.xlsx` y `.pptx` de prueba: la carga real (005) exige la parte
 * aunque los extractores no la lean.
 */
export const PACKAGE_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
</Types>`;

/** Escapa el texto para un nodo XML. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function runXml(text: string): string {
  const parts = text.split(/(\t|\n)/).filter((part) => part.length > 0);
  const inner = parts.map((part) => {
    if (part === '\t') return '<w:tab/>';
    if (part === '\n') return '<w:br/>';
    return `<w:t xml:space="preserve">${escapeXml(part)}</w:t>`;
  });
  return `<w:r>${inner.join('')}</w:r>`;
}

function paragraphXml(runs: string | readonly string[], properties = ''): string {
  const texts = typeof runs === 'string' ? [runs] : runs;
  const pPr = properties === '' ? '' : `<w:pPr>${properties}</w:pPr>`;
  return `<w:p>${pPr}${texts.map(runXml).join('')}</w:p>`;
}

function tableXml(rows: readonly (readonly string[])[]): string {
  const rowXml = (cells: readonly string[]): string =>
    `<w:tr>${cells.map((cell) => `<w:tc>${paragraphXml(cell)}</w:tc>`).join('')}</w:tr>`;
  return `<w:tbl>${rows.map(rowXml).join('')}</w:tbl>`;
}

function blockXml(block: DocxFixtureBlock): string {
  if ('table' in block) return tableXml(block.table);
  if ('heading' in block) {
    return paragraphXml(block.text, `<w:pStyle w:val="Ttulo${block.heading}"/>`);
  }
  if ('outlineLevel' in block) {
    return paragraphXml(block.text, `<w:outlineLvl w:val="${block.outlineLevel}"/>`);
  }
  return paragraphXml(block.text);
}

function documentXml(blocks: readonly DocxFixtureBlock[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"><w:body>${blocks.map(blockXml).join('')}<w:sectPr/></w:body></w:document>`;
}

function stylesXml(): string {
  const headingStyle = (level: number): string =>
    `<w:style w:type="paragraph" w:styleId="Ttulo${level}"><w:name w:val="heading ${level}"/></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${HEADING_LEVELS.map(headingStyle).join('')}</w:styles>`;
}

/** Arma un `.docx` con los bloques dados, en orden. */
export function buildDocx(blocks: readonly DocxFixtureBlock[]): Buffer {
  return buildZip({
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'word/document.xml': documentXml(blocks),
    'word/styles.xml': stylesXml(),
  });
}

/** Zip con las entradas dadas (ruta → texto UTF-8), para paquetes OOXML a medida o dañados. */
export function buildZip(entries: Readonly<Record<string, string>>): Buffer {
  const files: Zippable = Object.fromEntries(
    Object.entries(entries).map(([path, text]) => [path, strToU8(text)]),
  );
  return Buffer.from(zipSync(files));
}

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const CENTRAL_UNCOMPRESSED_SIZE_OFFSET = 24;

/**
 * Copia del zip cuyo directorio central declara `bytes` descomprimidos en cada entrada: así se ve una bomba de
 * compresión sin generar cientos de MiB en la prueba.
 */
export function declareUncompressedSize(zip: Buffer, bytes: number): Buffer {
  const copy = Buffer.from(zip);
  for (let offset = 0; offset <= copy.length - 4; offset += 1) {
    if (copy.readUInt32LE(offset) === CENTRAL_DIRECTORY_SIGNATURE) {
      copy.writeUInt32LE(bytes, offset + CENTRAL_UNCOMPRESSED_SIZE_OFFSET);
    }
  }
  return copy;
}
