/** Paquetes ZIP/OOXML sintéticos y deterministas para pruebas; no contienen datos de clientes. */
import {
  configure,
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
  type ZipWriterConstructorOptions,
} from '@zip.js/zip.js';

configure({ useWebWorkers: false });

export type FixtureEntry = readonly [name: string, content: string | Uint8Array];

export async function zipOf(
  entries: readonly FixtureEntry[],
  options: ZipWriterConstructorOptions = {},
): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), options);
  for (const [name, content] of entries)
    await writer.add(
      name,
      typeof content === 'string' ? new TextReader(content) : new Uint8ArrayReader(content),
    );
  return writer.close();
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type RawRecord = { readonly name: Uint8Array; readonly data: Uint8Array; readonly offset: number };

function header(signature: number, fields: readonly [number, 2 | 4][]): Uint8Array {
  const bytes = new Uint8Array(4 + fields.reduce((size, [, width]) => size + width, 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  let offset = 4;
  for (const [value, width] of fields) {
    if (width === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += width;
  }
  return bytes;
}

function localHeader({ name, data }: RawRecord): Uint8Array {
  const crc = crc32(data);
  const fields: [number, 2 | 4][] = [
    [20, 2],
    [0, 2],
    [0, 2],
    [0, 2],
    [0, 2],
    [crc, 4],
  ];
  fields.push([data.length, 4], [data.length, 4], [name.length, 2], [0, 2]);
  return header(0x04034b50, fields);
}

function centralHeader(record: RawRecord, name = record.name): Uint8Array {
  const crc = crc32(record.data);
  const fields: [number, 2 | 4][] = [
    [20, 2],
    [20, 2],
    [0, 2],
    [0, 2],
    [0, 2],
    [0, 2],
    [crc, 4],
  ];
  fields.push([record.data.length, 4], [record.data.length, 4], [name.length, 2], [0, 2], [0, 2]);
  fields.push([0, 2], [0, 2], [0, 4], [record.offset, 4]);
  return header(0x02014b50, fields);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/**
 * ZIP almacenado escrito a mano para los casos que ZipWriter impide (nombres duplicados).
 * `aliases` agrega registros centrales extra que apuntan a la entrada indicada (superposición).
 */
export function rawZip(
  entries: readonly FixtureEntry[],
  aliases: readonly { readonly name: string; readonly target: number }[] = [],
): Uint8Array {
  const encoder = new TextEncoder();
  const records: RawRecord[] = [];
  const locals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const record = { name: encoder.encode(name), data, offset };
    const local = concat([localHeader(record), record.name, data]);
    records.push(record);
    locals.push(local);
    offset += local.length;
  }
  const central = records.map((record) => concat([centralHeader(record), record.name]));
  for (const alias of aliases) {
    const target = records[alias.target];
    if (target === undefined) throw new Error('Alias sin entrada');
    const name = encoder.encode(alias.name);
    central.push(concat([centralHeader(target, name), name]));
  }
  const directory = concat(central);
  const end = header(0x06054b50, [
    [0, 2],
    [0, 2],
    [central.length, 2],
    [central.length, 2],
  ]);
  const tail = header(0, [
    [directory.length, 4],
    [offset, 4],
    [0, 2],
  ]).subarray(4);
  return concat([...locals, directory, end, tail]);
}

/** UTF-16 sin TextEncoder (que solo produce UTF-8), con o sin BOM. */
export function utf16(text: string, endian: 'le' | 'be', bom = true): Uint8Array {
  const units = [...(bom ? '﻿' : ''), ...text].join('');
  const bytes = new Uint8Array(units.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < units.length; index++)
    view.setUint16(index * 2, units.charCodeAt(index), endian === 'le');
  return bytes;
}

export const NS = {
  types: 'http://schemas.openxmlformats.org/package/2006/content-types',
  rels: 'http://schemas.openxmlformats.org/package/2006/relationships',
  transitionalDocument:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  strictDocument: 'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument',
} as const;

export const MAIN_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
} as const;

const MAIN_PARTS = { xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' } as const;

export function contentTypes(kind: 'xlsx' | 'pptx', extra = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${NS.types}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${MAIN_PARTS[kind]}" ContentType="${MAIN_TYPES[kind]}"/>${extra}</Types>`;
}

export function relationships(items: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS.rels}">${items.join('')}</Relationships>`;
}

export function relationship(id: string, type: string, target: string, external = false): string {
  return `<Relationship Id="${id}" Type="${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
}

/** Paquete OOXML mínimo válido: tipos, relación raíz officeDocument y parte principal. */
export function ooxmlEntries(
  kind: 'xlsx' | 'pptx',
  options: { readonly strict?: boolean; readonly main?: string } = {},
): FixtureEntry[] {
  const type = options.strict ? NS.strictDocument : NS.transitionalDocument;
  return [
    ['[Content_Types].xml', contentTypes(kind)],
    ['_rels/.rels', relationships([relationship('rId1', type, MAIN_PARTS[kind])])],
    [MAIN_PARTS[kind], options.main ?? '<?xml version="1.0" encoding="UTF-8"?><root/>'],
  ];
}
