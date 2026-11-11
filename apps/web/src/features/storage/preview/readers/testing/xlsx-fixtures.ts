/** Libros XLSX sintéticos y deterministas; el ZIP se escribe en orden distinto al de `<sheets>`. */
import { contentTypes, NS, relationship, relationships, type FixtureEntry } from './ooxml-fixtures';

export const SML = {
  transitional: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  strict: 'http://purl.oclc.org/ooxml/spreadsheetml/main',
} as const;
export const REL = {
  transitional: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  strict: 'http://purl.oclc.org/ooxml/officeDocument/relationships',
} as const;

export type FixtureSheet = {
  readonly name: string;
  readonly state?: string;
  readonly type?: 'worksheet' | 'chartsheet' | 'dialogsheet' | 'xlMacrosheet';
  /** Contenido de `<sheetData>` (solo worksheet). */
  readonly data?: string;
  readonly external?: boolean;
};

export type WorkbookFixture = {
  readonly sheets: readonly FixtureSheet[];
  readonly strict?: boolean;
  readonly date1904?: boolean;
  /** Contenido de cada `<si>`, p. ej. `<t>Hola</t>`. */
  readonly sharedStrings?: readonly string[];
  /** Contenido de `<styleSheet>`. */
  readonly styles?: string;
  readonly extraRelationships?: readonly string[];
};

const ROOT: Record<string, string> = {
  worksheet: 'worksheet',
  chartsheet: 'chartsheet',
  dialogsheet: 'dialogsheet',
  xlMacrosheet: 'worksheet',
};

function sheetPart(sheet: FixtureSheet, index: number, sml: string): FixtureEntry {
  const type = sheet.type ?? 'worksheet';
  const body = type === 'worksheet' ? `<sheetData>${sheet.data ?? ''}</sheetData>` : '';
  return [
    `xl/${type}s/sheet${index + 1}.xml`,
    `<${ROOT[type]} xmlns="${sml}">${body}</${ROOT[type]}>`,
  ];
}

function workbookXml(fixture: WorkbookFixture, sml: string, rel: string): string {
  const sheets = fixture.sheets
    .map(
      (sheet, index) =>
        `<sheet name="${sheet.name}" sheetId="${index + 1}"${sheet.state ? ` state="${sheet.state}"` : ''} r:id="rIdSheet${index + 1}"/>`,
    )
    .join('');
  const pr = fixture.date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>';
  return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${sml}" xmlns:r="${rel}">${pr}<sheets>${sheets}</sheets></workbook>`;
}

function workbookRelationships(fixture: WorkbookFixture, rel: string): string {
  // Orden inverso al de <sheets>: el orden de los .rels no debe importar.
  const sheets = fixture.sheets
    .map((sheet, index) => {
      const type = sheet.type ?? 'worksheet';
      const target = sheet.external
        ? 'https://evil.test/sheet.xml'
        : `${type}s/sheet${index + 1}.xml`;
      return relationship(`rIdSheet${index + 1}`, `${rel}/${type}`, target, sheet.external);
    })
    .reverse();
  const shared = fixture.sharedStrings
    ? [relationship('rIdStrings', `${rel}/sharedStrings`, 'sharedStrings.xml')]
    : [];
  const styles = fixture.styles ? [relationship('rIdStyles', `${rel}/styles`, 'styles.xml')] : [];
  return relationships([...sheets, ...shared, ...styles, ...(fixture.extraRelationships ?? [])]);
}

export function xlsxEntries(fixture: WorkbookFixture): FixtureEntry[] {
  const sml = fixture.strict ? SML.strict : SML.transitional;
  const rel = fixture.strict ? REL.strict : REL.transitional;
  const document = fixture.strict ? NS.strictDocument : NS.transitionalDocument;
  const entries: FixtureEntry[] = [
    ['[Content_Types].xml', contentTypes('xlsx')],
    ['_rels/.rels', relationships([relationship('rId1', document, 'xl/workbook.xml')])],
    ['xl/workbook.xml', workbookXml(fixture, sml, rel)],
    ['xl/_rels/workbook.xml.rels', workbookRelationships(fixture, rel)],
  ];
  if (fixture.sharedStrings) {
    const items = fixture.sharedStrings.map((item) => `<si>${item}</si>`).join('');
    entries.push(['xl/sharedStrings.xml', `<sst xmlns="${sml}">${items}</sst>`]);
  }
  if (fixture.styles)
    entries.push(['xl/styles.xml', `<styleSheet xmlns="${sml}">${fixture.styles}</styleSheet>`]);
  const sheets = fixture.sheets.flatMap((sheet, index) =>
    sheet.external ? [] : [sheetPart(sheet, index, sml)],
  );
  return [...entries, ...sheets.reverse()];
}

/** `<row>` con celdas `[ref, atributos, contenido]`. */
export function row(number: number, cells: readonly (readonly [string, string, string])[]): string {
  const content = cells.map(
    ([ref, attributes, inner]) => `<c r="${ref}"${attributes ? ` ${attributes}` : ''}>${inner}</c>`,
  );
  return `<row r="${number}">${content.join('')}</row>`;
}
