import { OoxmlError, type ZipPackage } from './ooxml-package-reader';
import { readRelationships, type OoxmlDocument, type Relationship } from './ooxml-relations';
import { attributeOf, parseXmlPart, type XmlElement } from './ooxml-xml-reader';
import { cellFormatOf, type CellFormat } from './xlsx-format';
import { readSheetWindow, SML_NS, type SheetProjection, type SheetWindow } from './xlsx-sheet';

export type SheetType = 'worksheet' | 'chartsheet' | 'dialogsheet' | 'macrosheet';
export type SheetState = 'visible' | 'hidden' | 'veryHidden';
export type SheetSummary = {
  readonly name: string;
  readonly type: SheetType;
  readonly state: SheetState;
};
export type WorkbookPreview = { readonly kind: 'xlsx'; readonly sheets: readonly SheetSummary[] };
export type XlsxWorkbook = {
  readonly preview: WorkbookPreview;
  readonly readSheet: (index: number, window: SheetWindow) => Promise<SheetProjection>;
};

type RawSheet = { readonly name: string; readonly state: SheetState; readonly id: string };
type SheetUnit = SheetSummary & { readonly part: string };

const RELATIONSHIP_NS = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships',
];
const RELATIONSHIP_BASES = [
  ...RELATIONSHIP_NS,
  'http://schemas.microsoft.com/office/2006/relationships',
].map((base) => `${base}/`);
const SHEET_TYPES: ReadonlyMap<string, SheetType> = new Map([
  ['worksheet', 'worksheet'],
  ['chartsheet', 'chartsheet'],
  ['dialogsheet', 'dialogsheet'],
  ['xlMacrosheet', 'macrosheet'],
  ['xlIntlMacrosheet', 'macrosheet'],
]);
const STATES: readonly unknown[] = ['visible', 'hidden', 'veryHidden'];
const corrupt = (): OoxmlError => new OoxmlError('corrupt');

function relationKind(type: string): string | undefined {
  const base = RELATIONSHIP_BASES.find((prefix) => type.startsWith(prefix));
  return base === undefined ? undefined : type.slice(base.length);
}

function rawSheet(element: XmlElement): RawSheet {
  const name = attributeOf(element, 'name');
  const id = RELATIONSHIP_NS.map((uri) => attributeOf(element, 'id', uri)).find(Boolean);
  const state = attributeOf(element, 'state') ?? 'visible';
  if (!name || !id || !STATES.includes(state)) throw corrupt();
  return { name, id, state: state as SheetState };
}

async function readWorkbookXml(pkg: ZipPackage, part: string) {
  const sheets: RawSheet[] = [];
  let date1904 = false;
  let inSheets = false;
  await parseXmlPart(pkg, part, {
    root: { local: 'workbook', namespaces: SML_NS },
    open: (element) => {
      if (!SML_NS.has(element.uri)) return;
      if (element.local === 'workbookPr')
        date1904 = ['1', 'true'].includes(attributeOf(element, 'date1904') ?? '');
      else if (element.local === 'sheets') inSheets = true;
      else if (element.local === 'sheet' && inSheets) sheets.push(rawSheet(element));
    },
    close: ({ uri, local }) => {
      if (SML_NS.has(uri) && local === 'sheets') inSheets = false;
    },
  });
  return { sheets, date1904 };
}

/** D4 en XLSX: una relación estructural externa, inválida o ausente es corrupta; las demás no se siguen. */
function internalPart(pkg: ZipPackage, relation: Relationship | undefined): string {
  if (relation?.target.mode !== 'internal' || !pkg.has(relation.target.part)) throw corrupt();
  return relation.target.part;
}

function sheetUnits(pkg: ZipPackage, raw: readonly RawSheet[], relations: readonly Relationship[]) {
  const byId = new Map(relations.map((relation) => [relation.id, relation]));
  const used = new Set<string>();
  return raw.map((sheet): SheetUnit => {
    const relation = byId.get(sheet.id);
    const type = SHEET_TYPES.get(relationKind(relation?.type ?? '') ?? '');
    if (used.has(sheet.id) || type === undefined) throw corrupt();
    used.add(sheet.id);
    return { name: sheet.name, state: sheet.state, type, part: internalPart(pkg, relation) };
  });
}

function optionalPart(pkg: ZipPackage, relations: readonly Relationship[], kind: string) {
  const matches = relations.filter((relation) => relationKind(relation.type) === kind);
  if (matches.length > 1) throw corrupt();
  return matches.length === 0 ? undefined : internalPart(pkg, matches[0]);
}

/** Solo `<numFmts>` y `<cellXfs><xf numFmtId>`: fuentes, colores, rellenos y bordes se ignoran. */
async function readFormats(pkg: ZipPackage, part: string | undefined): Promise<CellFormat[]> {
  if (part === undefined) return [];
  const codes = new Map<number, string>();
  const ids: number[] = [];
  let inCellXfs = false;
  const idOf = (element: XmlElement): number => {
    const value = attributeOf(element, 'numFmtId') ?? '0';
    if (!/^(0|[1-9][0-9]*)$/.test(value)) throw corrupt();
    return Number(value);
  };
  await parseXmlPart(pkg, part, {
    root: { local: 'styleSheet', namespaces: SML_NS },
    open: (element) => {
      if (!SML_NS.has(element.uri)) return;
      if (element.local === 'numFmt')
        codes.set(idOf(element), attributeOf(element, 'formatCode') ?? '');
      else if (element.local === 'cellXfs') inCellXfs = true;
      else if (element.local === 'xf' && inCellXfs) ids.push(idOf(element));
    },
    close: ({ uri, local }) => {
      if (SML_NS.has(uri) && local === 'cellXfs') inCellXfs = false;
    },
  });
  return ids.map((id) => cellFormatOf(id, codes.get(id)));
}

const EMPTY_SHEET = { columns: 0, rows: [], missingCache: 0 } as const;

export async function openXlsxWorkbook(
  pkg: ZipPackage,
  document: OoxmlDocument,
): Promise<XlsxWorkbook> {
  const { sheets, date1904 } = await readWorkbookXml(pkg, document.mainPart);
  const relations = await readRelationships(pkg, document.mainPart);
  const units = sheetUnits(pkg, sheets, relations);
  const sharedStrings = optionalPart(pkg, relations, 'sharedStrings');
  const formats = await readFormats(pkg, optionalPart(pkg, relations, 'styles'));
  return {
    preview: {
      kind: 'xlsx',
      sheets: units.map(({ name, type, state }) => ({ name, type, state })),
    },
    readSheet: async (index, window) => {
      const unit = units[index];
      if (unit === undefined) throw new OoxmlError('unavailable');
      // Gráficos, diálogos y macros: unidad reconocida sin celdas; nunca se dibuja ni se ejecuta nada.
      if (unit.type !== 'worksheet') return { index, ...EMPTY_SHEET };
      const projection = await readSheetWindow(
        { pkg, part: unit.part, sharedStrings, formats, date1904 },
        window,
      );
      return { index, ...projection };
    },
  };
}
