import type { ZipPackage } from './ooxml-package-reader';
import { attributeOf, parseXmlPart, type XmlElement, type XmlHandlers } from './ooxml-xml-reader';
import type { SlideBlock, SlideReading } from './pptx-model';
import {
  assertCurrent,
  booleanAttribute,
  DML_NS,
  fallbackOnly,
  PML_NS,
  slideHeader,
  type SlideHeader,
  type SlidePart,
} from './pptx-xml';

type Role =
  | 'root'
  | 'data'
  | 'tree'
  | 'group'
  | 'shape'
  | 'frame'
  | 'nonvisual'
  | 'properties'
  | 'placeholder'
  | 'body'
  | 'paragraph'
  | 'run'
  | 'text'
  | 'break'
  | 'graphic'
  | 'graphicData'
  | 'table'
  | 'row'
  | 'cell'
  | 'other';
type Shape = {
  kind: 'group' | 'text' | 'table';
  hidden: boolean;
  placeholder: boolean;
  text: string;
  rows: string[][];
};
type Frame = {
  role: Role;
  shape?: Shape;
  body?: string[];
  paragraph?: { text: string };
  row?: string[];
  cell?: { text: string };
};
type Reading = {
  readonly source: SlidePart;
  readonly context: SlideReading;
  readonly stack: Frame[];
  readonly blocks: SlideBlock[];
  header: SlideHeader;
};

const PML_PATHS: ReadonlyMap<string, Role> = new Map([
  ['root:cSld', 'data'],
  ['data:spTree', 'tree'],
  ['tree:grpSp', 'group'],
  ['group:grpSp', 'group'],
  ['tree:sp', 'shape'],
  ['group:sp', 'shape'],
  ['tree:graphicFrame', 'frame'],
  ['group:graphicFrame', 'frame'],
  ['group:nvGrpSpPr', 'nonvisual'],
  ['shape:nvSpPr', 'nonvisual'],
  ['frame:nvGraphicFramePr', 'nonvisual'],
  ['nonvisual:cNvPr', 'properties'],
  ['nonvisual:nvPr', 'properties'],
  ['properties:ph', 'placeholder'],
  ['shape:txBody', 'body'],
]);
const DML_PATHS: ReadonlyMap<string, Role> = new Map([
  ['frame:graphic', 'graphic'],
  ['graphic:graphicData', 'graphicData'],
  ['graphicData:tbl', 'table'],
  ['table:tr', 'row'],
  ['row:tc', 'cell'],
  ['cell:txBody', 'body'],
  ['body:p', 'paragraph'],
  ['paragraph:r', 'run'],
  ['paragraph:fld', 'run'],
  ['run:t', 'text'],
  ['paragraph:br', 'break'],
]);
const TABLE_URIS = new Set([
  'http://schemas.openxmlformats.org/drawingml/2006/table',
  'http://purl.oclc.org/ooxml/drawingml/table',
]);

function roleOf(element: XmlElement, parent?: Role): Role {
  if (parent === undefined) return 'root';
  const key = `${parent}:${element.local}`;
  if (PML_NS.has(element.uri)) return PML_PATHS.get(key) ?? 'other';
  const role = DML_NS.has(element.uri) ? (DML_PATHS.get(key) ?? 'other') : 'other';
  if (role === 'graphicData' && !TABLE_URIS.has(attributeOf(element, 'uri') ?? '')) return 'other';
  return role;
}

function beginContent(frame: Frame, element: XmlElement): void {
  if (frame.role === 'body') frame.body = [];
  else if (frame.role === 'paragraph') frame.paragraph = { text: '' };
  else if (frame.role === 'row') frame.row = [];
  else if (frame.role === 'cell') frame.cell = { text: '' };
  else if (frame.role === 'break' && frame.paragraph) frame.paragraph.text += '\n';
  else if (frame.role === 'placeholder' && frame.shape) frame.shape.placeholder = true;
  else if (frame.role === 'properties' && element.local === 'cNvPr' && frame.shape) {
    const hidden = booleanAttribute(element, 'hidden', false);
    frame.shape.hidden = frame.shape.hidden || hidden;
  }
}

function openElement(reading: Reading, element: XmlElement): void {
  assertCurrent(reading.context);
  const parent = reading.stack[reading.stack.length - 1];
  const role = roleOf(element, parent?.role);
  const frame: Frame = { ...parent, role };
  if (role === 'root') reading.header = slideHeader(element);
  if (role === 'group' || role === 'shape' || role === 'frame') {
    frame.shape = {
      kind: role === 'group' ? 'group' : role === 'shape' ? 'text' : 'table',
      hidden: parent?.shape?.hidden ?? false,
      placeholder: false,
      text: '',
      rows: [],
    };
  }
  beginContent(frame, element);
  reading.stack.push(frame);
}

function emitShape(reading: Reading, shape: Shape | undefined): void {
  if (!shape || shape.hidden || (reading.source.root !== 'sld' && shape.placeholder)) return;
  if (shape.kind === 'text' && shape.text.trim() !== '')
    reading.blocks.push({ kind: 'text', text: shape.text });
  else if (
    shape.kind === 'table' &&
    shape.rows.some((row) => row.some((cell) => cell.trim() !== ''))
  )
    reading.blocks.push({ kind: 'table', rows: shape.rows });
}

function closeElement(reading: Reading): void {
  assertCurrent(reading.context);
  const frame = reading.stack.pop();
  if (!frame) return;
  if (frame.role === 'paragraph' && frame.paragraph) frame.body?.push(frame.paragraph.text);
  else if (frame.role === 'body') {
    const text = (frame.body ?? []).join('\n');
    if (frame.cell) frame.cell.text = text;
    else if (frame.shape) frame.shape.text = text;
  } else if (frame.role === 'cell' && frame.cell) frame.row?.push(frame.cell.text);
  else if (frame.role === 'row' && frame.row) frame.shape?.rows.push(frame.row);
  else if (frame.role === 'shape' || frame.role === 'frame') emitShape(reading, frame.shape);
}

function handlersOf(reading: Reading): XmlHandlers {
  return fallbackOnly({
    root: { local: reading.source.root, namespaces: PML_NS },
    signal: reading.context.signal,
    open: (element) => openElement(reading, element),
    close: () => closeElement(reading),
    text: (value) => {
      assertCurrent(reading.context);
      const frame = reading.stack[reading.stack.length - 1];
      if (frame?.role === 'text' && frame.paragraph) frame.paragraph.text += value;
    },
  });
}

export async function readSlidePart(
  pkg: ZipPackage,
  source: SlidePart,
  context: SlideReading,
): Promise<{ readonly header: SlideHeader; readonly blocks: readonly SlideBlock[] }> {
  assertCurrent(context);
  const reading: Reading = {
    source,
    context,
    stack: [],
    blocks: [],
    header: { hidden: false, showMasterShapes: true },
  };
  await parseXmlPart(pkg, source.part, handlersOf(reading));
  return { header: reading.header, blocks: reading.blocks };
}
