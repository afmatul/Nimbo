import { buildZip, escapeXml, PACKAGE_CONTENT_TYPES } from './docx-fixture';

/**
 * Generador de `.xlsx` mínimos para pruebas (019 D-5): sin binarios versionados. Las cadenas van a
 * `xl/sharedStrings.xml` (como las escribe Excel), los números como valor y `{ inline }` como cadena en línea.
 */
export type XlsxFixtureCell = string | number | { readonly inline: string } | null;

export interface XlsxFixtureSheet {
  readonly name: string;
  /** Una fila por arreglo; `null` deja la celda sin escribir. */
  readonly rows: readonly (readonly XlsxFixtureCell[])[];
}

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WORKSHEET_TYPE = `${R_NS}/worksheet`;
const SHARED_STRINGS_TYPE = `${R_NS}/sharedStrings`;
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const FIRST_COLUMN_CODE = 'A'.charCodeAt(0);

function cellXml(cell: XlsxFixtureCell, ref: string, shared: string[]): string {
  if (cell === null) return '';
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
  if (typeof cell === 'object') {
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell.inline)}</t></is></c>`;
  }
  shared.push(cell);
  return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
}

function sheetXml(sheet: XlsxFixtureSheet, shared: string[]): string {
  const rowXml = (cells: readonly XlsxFixtureCell[], row: number): string => {
    const ref = (column: number): string =>
      `${String.fromCharCode(FIRST_COLUMN_CODE + column)}${row + 1}`;
    return `<row r="${row + 1}">${cells.map((cell, column) => cellXml(cell, ref(column), shared)).join('')}</row>`;
  };
  return `${XML_DECLARATION}<worksheet xmlns="${MAIN_NS}"><sheetData>${sheet.rows.map(rowXml).join('')}</sheetData></worksheet>`;
}

function sharedStringsXml(shared: readonly string[]): string {
  const items = shared.map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`);
  return `${XML_DECLARATION}<sst xmlns="${MAIN_NS}" count="${shared.length}" uniqueCount="${shared.length}">${items.join('')}</sst>`;
}

function workbookXml(sheets: readonly XlsxFixtureSheet[]): string {
  const sheetRefs = sheets.map(
    (sheet, index) =>
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  );
  return `${XML_DECLARATION}<workbook xmlns="${MAIN_NS}" xmlns:r="${R_NS}"><sheets>${sheetRefs.join('')}</sheets></workbook>`;
}

function workbookRelsXml(sheets: readonly XlsxFixtureSheet[]): string {
  const sheetRels = sheets.map(
    (_sheet, index) =>
      `<Relationship Id="rId${index + 1}" Type="${WORKSHEET_TYPE}" Target="worksheets/sheet${index + 1}.xml"/>`,
  );
  const sharedRel = `<Relationship Id="rIdShared" Type="${SHARED_STRINGS_TYPE}" Target="sharedStrings.xml"/>`;
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels.join('')}${sharedRel}</Relationships>`;
}

/** Arma un `.xlsx` con las hojas dadas, en orden (`xl/worksheets/sheetN.xml`). */
export function buildXlsx(sheets: readonly XlsxFixtureSheet[]): Buffer {
  const shared: string[] = [];
  const worksheets = Object.fromEntries(
    sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet, shared)]),
  );
  return buildZip({
    '[Content_Types].xml': PACKAGE_CONTENT_TYPES,
    'xl/workbook.xml': workbookXml(sheets),
    'xl/_rels/workbook.xml.rels': workbookRelsXml(sheets),
    'xl/sharedStrings.xml': sharedStringsXml(shared),
    ...worksheets,
  });
}
