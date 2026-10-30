import { OoxmlError, type ZipPackage } from './ooxml-package-reader';
import { attributeOf, parseXmlPart, type XmlElement, type XmlName } from './ooxml-xml-reader';
import { formatIsoDate, formatPercent, formatSerial, type CellFormat } from './xlsx-format';

export type CellType = 'text' | 'number' | 'boolean' | 'error' | 'date' | 'percent' | 'no-cache';
export type CellProjection = {
  readonly column: number;
  readonly text: string;
  readonly type: CellType;
};
export type RowProjection = { readonly row: number; readonly cells: readonly CellProjection[] };
export type SheetProjection = {
  readonly index: number;
  readonly columns: number;
  readonly rows: readonly RowProjection[];
  /** Fórmulas sin valor guardado dentro de esta ventana. */
  readonly missingCache: number;
  readonly nextOffset?: number;
};

/** Unidad de paginación de la vista (como una página de PDF): no limita filas, todas siguen navegables. */
export const SHEET_WINDOW_ROWS = 200;
export const NO_CACHE_TEXT = 'Sin valor guardado';

export const SML_NS: ReadonlySet<string> = new Set([
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://purl.oclc.org/ooxml/spreadsheetml/main',
]);

export type SheetSource = {
  readonly pkg: ZipPackage;
  readonly part: string;
  readonly sharedStrings: string | undefined;
  readonly formats: readonly CellFormat[];
  readonly date1904: boolean;
};
/** `current` permite cortar una ventana que dejó de ser la pedida. */
export type SheetWindow = {
  readonly offset: number;
  readonly current: () => boolean;
  readonly signal?: AbortSignal;
};

type Draft = {
  readonly column: number;
  readonly type: string | undefined;
  readonly style: number;
  formula: boolean;
  value?: string;
  inline: string;
};
type Cell = { column: number; text: string; type: CellType; shared?: number };
type Reading = {
  readonly window: SheetWindow;
  readonly rows: { row: number; cells: Cell[] }[];
  rowElements: number;
  lastRow: number;
  lastColumn: number;
  row?: { row: number; cells: Cell[] } | undefined;
  draft?: Draft | undefined;
  capture?: 'v' | 't' | undefined;
  inline: boolean;
  phonetic: boolean;
  more: boolean;
};

/** Límites del propio formato (ECMA-376-1 §18.3.1): 16 384 columnas y 1 048 576 filas. */
const MAX_COLUMN = 16_384;
const MAX_ROW = 1_048_576;
const WINDOW_END = new Error('Fin de ventana');
const corrupt = (): OoxmlError => new OoxmlError('corrupt');

function positiveInteger(text: string | undefined, max: number): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!/^[1-9][0-9]*$/.test(text) || value > max) throw corrupt();
  return value;
}

function columnOf(reference: string | undefined, row: number): number | undefined {
  if (reference === undefined) return undefined;
  const match = /^([A-Z]{1,3})([1-9][0-9]*)$/.exec(reference);
  if (match === null || Number(match[2]) !== row) throw corrupt();
  const column = [...(match[1] ?? '')].reduce(
    (sum, letter) => sum * 26 + letter.charCodeAt(0) - 64,
    0,
  );
  if (column > MAX_COLUMN) throw corrupt();
  return column;
}

function openRow(reading: Reading, element: XmlElement): void {
  if (!reading.window.current()) throw new OoxmlError('unavailable');
  reading.rowElements++;
  if (reading.rowElements > reading.window.offset + SHEET_WINDOW_ROWS) {
    reading.more = true;
    throw WINDOW_END;
  }
  const row = positiveInteger(attributeOf(element, 'r'), MAX_ROW) ?? reading.lastRow + 1;
  if (row > MAX_ROW) throw corrupt();
  reading.lastRow = row;
  reading.lastColumn = 0;
  reading.row = reading.rowElements > reading.window.offset ? { row, cells: [] } : undefined;
}

function openCell(reading: Reading, element: XmlElement): void {
  if (reading.row === undefined) return;
  const column = columnOf(attributeOf(element, 'r'), reading.lastRow) ?? reading.lastColumn + 1;
  if (column > MAX_COLUMN) throw corrupt();
  reading.lastColumn = column;
  const style = attributeOf(element, 's');
  reading.draft = {
    column,
    type: attributeOf(element, 't'),
    style:
      style === undefined || style === '0'
        ? 0
        : (positiveInteger(style, Number.MAX_SAFE_INTEGER) ?? 0),
    formula: false,
    inline: '',
  };
}

function openNested(reading: Reading, local: string): void {
  const draft = reading.draft;
  if (draft === undefined) return;
  if (local === 'f') draft.formula = true;
  else if (local === 'v') {
    draft.value = '';
    reading.capture = 'v';
  } else if (local === 'is') reading.inline = true;
  else if (local === 'rPh') reading.phonetic = true;
  else if (local === 't' && reading.inline && !reading.phonetic) reading.capture = 't';
}

function numberCell(source: SheetSource, draft: Draft, value: string): Pick<Cell, 'text' | 'type'> {
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(value)) throw corrupt();
  const format =
    draft.style === 0 && source.formats.length === 0 ? undefined : source.formats[draft.style];
  if (format === undefined && draft.style !== 0) throw corrupt();
  if (format?.kind === 'percent')
    return { text: formatPercent(Number(value), format.decimals), type: 'percent' };
  if (format?.kind === 'date') {
    const text = formatSerial(Number(value), format, source.date1904);
    if (text !== undefined) return { text, type: 'date' };
  }
  return { text: value, type: 'number' };
}

/** Nunca se interpreta `<f>`: solo el valor que el archivo guardó. */
function cellOf(source: SheetSource, draft: Draft): Cell | undefined {
  const { column, value } = draft;
  if (draft.type === 'inlineStr') return { column, text: draft.inline, type: 'text' };
  if (value === undefined || (draft.formula && value === '' && draft.type !== 'str'))
    return draft.formula ? { column, text: NO_CACHE_TEXT, type: 'no-cache' } : undefined;
  switch (draft.type) {
    case 's':
      if (!/^(0|[1-9][0-9]*)$/.test(value)) throw corrupt();
      return { column, text: '', type: 'text', shared: Number(value) };
    case 'str':
      return { column, text: value, type: 'text' };
    case 'b':
      if (value !== '0' && value !== '1') throw corrupt();
      return { column, text: value === '1' ? 'VERDADERO' : 'FALSO', type: 'boolean' };
    case 'e':
      return { column, text: value, type: 'error' };
    case 'd': {
      const format = source.formats[draft.style];
      if (format === undefined && draft.style !== 0) throw corrupt();
      const text = formatIsoDate(value, format ?? { kind: 'general' });
      if (text === undefined) throw corrupt();
      return { column, text, type: 'date' };
    }
    case undefined:
    case 'n':
      return { column, ...numberCell(source, draft, value) };
    default:
      throw corrupt();
  }
}

function closeElement(reading: Reading, source: SheetSource, local: string): void {
  if (local === 'v' || local === 't') reading.capture = undefined;
  else if (local === 'rPh') reading.phonetic = false;
  else if (local === 'is') reading.inline = false;
  else if (local === 'c' && reading.draft !== undefined) {
    const cell = cellOf(source, reading.draft);
    if (cell !== undefined) reading.row?.cells.push(cell);
    reading.draft = undefined;
  } else if (local === 'row' && reading.row !== undefined) {
    if (reading.row.cells.length > 0) reading.rows.push(reading.row);
    reading.row = undefined;
  }
}

function sheetHandlers(reading: Reading, source: SheetSource) {
  return {
    root: { local: 'worksheet', namespaces: SML_NS },
    signal: reading.window.signal,
    open: (element: XmlElement) => {
      if (!SML_NS.has(element.uri)) return;
      if (element.local === 'row') openRow(reading, element);
      else if (element.local === 'c') openCell(reading, element);
      else openNested(reading, element.local);
    },
    close: (element: XmlName) => {
      if (SML_NS.has(element.uri)) closeElement(reading, source, element.local);
    },
    text: (text: string) => {
      if (reading.capture === 'v' && reading.draft) reading.draft.value += text;
      if (reading.capture === 't' && reading.draft) reading.draft.inline += text;
    },
  };
}

/** Corta al completar lo pedido; el rango ya recibido puede incluir bytes de lo que sigue. */
async function readUntil(
  pkg: ZipPackage,
  part: string,
  handlers: Parameters<typeof parseXmlPart>[2],
) {
  await parseXmlPart(pkg, part, handlers).catch((error: unknown) => {
    if (error !== WINDOW_END) throw error;
  });
}

type SharedRead = {
  index: number;
  text: string;
  inside: boolean;
  phonetic: boolean;
  capture: boolean;
};

/** Cierra un `<si>`: guarda su texto si ese índice se pidió y aún no se leyó; devuelve si lo guardó. */
function recordString(
  read: SharedRead,
  wanted: Map<number, string | undefined>,
  window: SheetWindow,
): boolean {
  if (!window.current()) throw new OoxmlError('unavailable');
  if (!wanted.has(read.index) || wanted.get(read.index) !== undefined) return false;
  wanted.set(read.index, read.text);
  return true;
}

function sharedHandlers(
  read: SharedRead,
  wanted: Map<number, string | undefined>,
  window: SheetWindow,
) {
  let pending = wanted.size;
  return {
    root: { local: 'sst', namespaces: SML_NS },
    signal: window.signal,
    open: ({ uri, local }: XmlElement) => {
      if (!SML_NS.has(uri)) return;
      if (local === 'si') Object.assign(read, { inside: true, text: '' });
      else if (local === 'rPh') read.phonetic = true;
      else if (local === 't' && read.inside && !read.phonetic) read.capture = true;
    },
    close: ({ uri, local }: XmlName) => {
      if (!SML_NS.has(uri)) return;
      if (local === 't') read.capture = false;
      else if (local === 'rPh') read.phonetic = false;
      else if (local === 'si') {
        if (recordString(read, wanted, window) && --pending === 0) throw WINDOW_END;
        Object.assign(read, { inside: false, index: read.index + 1 });
      }
    },
    text: (text: string) => {
      if (read.capture) read.text += text;
    },
  };
}

/** Relectura de shared strings solo para los índices de la ventana; un índice ausente es corrupto. */
async function resolveShared(
  source: SheetSource,
  cells: Cell[],
  window: SheetWindow,
): Promise<void> {
  const shared = cells.filter((cell) => cell.shared !== undefined);
  if (shared.length === 0) return;
  if (source.sharedStrings === undefined) throw corrupt();
  const wanted = new Map<number, string | undefined>(
    shared.map(({ shared: index }) => [index ?? 0, undefined]),
  );
  const read: SharedRead = { index: 0, text: '', inside: false, phonetic: false, capture: false };
  await readUntil(source.pkg, source.sharedStrings, sharedHandlers(read, wanted, window));
  for (const cell of shared) {
    const text = wanted.get(cell.shared ?? 0);
    if (text === undefined) throw corrupt();
    cell.text = text;
  }
}

export async function readSheetWindow(
  source: SheetSource,
  window: SheetWindow,
): Promise<Omit<SheetProjection, 'index'>> {
  const reading: Reading = {
    window,
    rows: [],
    rowElements: 0,
    lastRow: 0,
    lastColumn: 0,
    inline: false,
    phonetic: false,
    more: false,
  };
  await readUntil(source.pkg, source.part, sheetHandlers(reading, source));
  const cells: Cell[] = [];
  for (const row of reading.rows) for (const cell of row.cells) cells.push(cell);
  await resolveShared(source, cells, window);
  const rows = reading.rows.map(({ row, cells: list }) => ({
    row,
    cells: list.map(({ column, text, type }) => ({ column, text, type })),
  }));
  return {
    columns: cells.reduce((max, cell) => Math.max(max, cell.column), 0),
    rows,
    missingCache: cells.filter((cell) => cell.type === 'no-cache').length,
    ...(reading.more ? { nextOffset: window.offset + SHEET_WINDOW_ROWS } : {}),
  };
}
