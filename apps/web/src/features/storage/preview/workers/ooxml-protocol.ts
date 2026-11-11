import type { OoxmlFailureReason } from '../readers/ooxml-package-reader';
import type { OoxmlKind } from '../readers/ooxml-relations';
import type { PresentationPreview, SlideProjection } from '../readers/pptx-model';
import type { WorkbookPreview } from '../readers/xlsx-reader';
import type { SheetProjection } from '../readers/xlsx-sheet';

/** La URL firmada solo viaja hacia el worker, en `open`. */
export type OpenRequest = {
  readonly type: 'open';
  readonly session: number;
  readonly kind: OoxmlKind;
  readonly url: string;
};
/** `request` creciente: el worker y el hilo principal descartan unidades que ya no son la pedida. */
export type UnitRequest = {
  readonly type: 'unit';
  readonly session: number;
  readonly request: number;
  readonly index: number;
  readonly offset: number;
};
export type WorkerRequest = OpenRequest | UnitRequest;
export type OoxmlPreview = WorkbookPreview | PresentationPreview;
export type OoxmlProjection = SheetProjection | SlideProjection;
/** Del worker solo salen sesión, proyecciones estrechas y razones cerradas; nunca URL, Error, XML ni bytes. */
export type WorkerMessage =
  | { readonly type: 'opened'; readonly session: number; readonly preview?: OoxmlPreview }
  | {
      readonly type: 'unit';
      readonly session: number;
      readonly request: number;
      readonly projection: OoxmlProjection;
    }
  | { readonly type: 'failure'; readonly session: number; readonly reason: OoxmlFailureReason };

const KINDS: readonly unknown[] = ['xlsx', 'pptx'];
const REASONS: readonly unknown[] = ['corrupt', 'protected', 'unavailable', 'memory'];
const SHEET_TYPES: readonly unknown[] = ['worksheet', 'chartsheet', 'dialogsheet', 'macrosheet'];
const SHEET_STATES: readonly unknown[] = ['visible', 'hidden', 'veryHidden'];
const CELL_TYPES: readonly unknown[] = [
  'text',
  'number',
  'boolean',
  'error',
  'date',
  'percent',
  'no-cache',
];

type Shape = Record<string, unknown>;

/** Objeto plano con exactamente esas claves (las opcionales pueden faltar). */
function shape(
  data: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): Shape | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const actual = Object.keys(data);
  const required = keys.every((key) => actual.includes(key));
  const known = actual.every((key) => keys.includes(key) || optional.includes(key));
  return required && known ? (data as Shape) : undefined;
}

function integer(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

const isSession = (value: unknown): value is number => integer(value, 1);

function everyItem(value: unknown, valid: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(valid);
}

function validSheet(data: unknown): boolean {
  const sheet = shape(data, ['name', 'type', 'state']);
  return (
    typeof sheet?.name === 'string' &&
    SHEET_TYPES.includes(sheet.type) &&
    SHEET_STATES.includes(sheet.state)
  );
}

function validWorkbook(data: unknown): data is WorkbookPreview {
  const preview = shape(data, ['kind', 'sheets']);
  return preview?.kind === 'xlsx' && everyItem(preview.sheets, validSheet);
}

function validSlide(data: unknown): boolean {
  const slide = shape(data, ['index', 'state']);
  return integer(slide?.index, 0) && (slide?.state === 'visible' || slide?.state === 'hidden');
}

function validPreview(data: unknown): data is OoxmlPreview {
  if (validWorkbook(data)) return true;
  const preview = shape(data, ['kind', 'slides']);
  return preview?.kind === 'pptx' && everyItem(preview.slides, validSlide);
}

function validCell(data: unknown): boolean {
  const cell = shape(data, ['column', 'text', 'type']);
  return (
    integer(cell?.column, 1) && typeof cell?.text === 'string' && CELL_TYPES.includes(cell.type)
  );
}

function validRow(data: unknown): boolean {
  const row = shape(data, ['row', 'cells']);
  return integer(row?.row, 1) && everyItem(row?.cells, validCell);
}

function validSheetProjection(data: unknown): data is SheetProjection {
  const value = shape(data, ['index', 'columns', 'rows', 'missingCache'], ['nextOffset']);
  if (value === undefined || !integer(value.index, 0) || !integer(value.columns, 0)) return false;
  if (!integer(value.missingCache, 0) || !everyItem(value.rows, validRow)) return false;
  return value.nextOffset === undefined || integer(value.nextOffset, 1);
}

function validBlock(data: unknown): boolean {
  const text = shape(data, ['kind', 'text']);
  if (text?.kind === 'text' && typeof text.text === 'string') return true;
  const table = shape(data, ['kind', 'rows']);
  return (
    table?.kind === 'table' &&
    everyItem(table.rows, (row) => everyItem(row, (cell) => typeof cell === 'string'))
  );
}

function validProjection(data: unknown): data is OoxmlProjection {
  if (validSheetProjection(data)) return true;
  const slide = shape(data, ['index', 'blocks']);
  return integer(slide?.index, 0) && everyItem(slide?.blocks, validBlock);
}

export function parseWorkerRequest(data: unknown): WorkerRequest | undefined {
  const open = shape(data, ['type', 'session', 'kind', 'url']);
  if (open?.type === 'open' && isSession(open.session) && KINDS.includes(open.kind))
    return typeof open.url === 'string' && open.url !== ''
      ? { type: 'open', session: open.session, kind: open.kind as OoxmlKind, url: open.url }
      : undefined;
  const unit = shape(data, ['type', 'session', 'request', 'index', 'offset']);
  if (unit?.type !== 'unit' || !isSession(unit.session) || !integer(unit.request, 1))
    return undefined;
  return integer(unit.index, 0) && integer(unit.offset, 0)
    ? {
        type: 'unit',
        session: unit.session,
        request: unit.request,
        index: unit.index,
        offset: unit.offset,
      }
    : undefined;
}

function parseOpened(data: unknown): WorkerMessage | undefined {
  const opened = shape(data, ['type', 'session'], ['preview']);
  if (opened?.type !== 'opened' || !isSession(opened.session)) return undefined;
  if (opened.preview === undefined) return { type: 'opened', session: opened.session };
  return validPreview(opened.preview)
    ? { type: 'opened', session: opened.session, preview: opened.preview }
    : undefined;
}

function parseUnit(data: unknown): WorkerMessage | undefined {
  const unit = shape(data, ['type', 'session', 'request', 'projection']);
  if (unit?.type !== 'unit' || !isSession(unit.session) || !integer(unit.request, 1))
    return undefined;
  return validProjection(unit.projection)
    ? { type: 'unit', session: unit.session, request: unit.request, projection: unit.projection }
    : undefined;
}

function parseFailure(data: unknown): WorkerMessage | undefined {
  const failure = shape(data, ['type', 'session', 'reason']);
  if (
    failure?.type !== 'failure' ||
    !isSession(failure.session) ||
    !REASONS.includes(failure.reason)
  )
    return undefined;
  return {
    type: 'failure',
    session: failure.session,
    reason: failure.reason as OoxmlFailureReason,
  };
}

export function parseWorkerMessage(data: unknown): WorkerMessage | undefined {
  return parseOpened(data) ?? parseUnit(data) ?? parseFailure(data);
}
