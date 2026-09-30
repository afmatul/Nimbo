import { Injectable } from '@nestjs/common';

import type {
  ByteReader,
  DetectionResult,
  IFileTypeDetector,
} from '../application/ports/i-file-type-detector.port';
import { fileKindOf } from '../domain/file-kind';

const KIB = 1024;
const MIB = KIB * KIB;

/** Bytes de cabecera que se leen siempre: cubren las firmas y el `%PDF-` desplazado (plan §6). */
const HEADER_BYTES = KIB;
/** Texto: UTF-8 estricto en bloques de 4 MiB (D-9). */
const TEXT_CHUNK_BYTES = 4 * MIB;

/** PE: `MZ` y, en `e_lfanew` (0x3C), `PE\0\0`. */
const PE_POINTER_OFFSET = 0x3c;
const DOS_HEADER_BYTES = 0x40;
const MZ = Buffer.from('MZ', 'latin1');
const PE = Buffer.from('PE\0\0', 'latin1');
const EXECUTABLE_MAGICS = [
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF
  Buffer.from([0xfe, 0xed, 0xfa, 0xce]), // Mach-O 32
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), // Mach-O 64
  Buffer.from([0xce, 0xfa, 0xed, 0xfe]), // Mach-O 32, little-endian
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), // Mach-O 64, little-endian
];
/** Mach-O universal: `CAFEBABE` + número de arquitecturas; una clase Java lleva ahí su versión (≥ 45). */
const FAT_MAGIC = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
const FAT_MAX_ARCHITECTURES = 30;

const PDF_MARKER = Buffer.from('%PDF-', 'latin1');
const IMAGE_SIGNATURES: Readonly<Record<string, (header: Buffer) => boolean>> = {
  png: (h) => startsWith(h, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (h) => startsWith(h, Buffer.from([0xff, 0xd8, 0xff])),
  jpeg: (h) => startsWith(h, Buffer.from([0xff, 0xd8, 0xff])),
  gif: (h) => startsWith(h, ascii('GIF87a')) || startsWith(h, ascii('GIF89a')),
  webp: (h) => startsWith(h, ascii('RIFF')) && startsWith(h.subarray(8), ascii('WEBP')),
};

/** ZIP (APPNOTE): encabezado local, EOCD, localizador Zip64 y entrada del directorio central. */
const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP_CENTRAL_ENTRY = 0x02014b50;
const EOCD_BYTES = 22;
const ZIP64_LOCATOR_BYTES = 20;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const CENTRAL_ENTRY_BYTES = 46;
const MAX_CENTRAL_DIRECTORY_BYTES = 8 * MIB;
/** Un ZIP de 4 GiB o más necesita Zip64: fuera del rango de los planes, se rechaza. */
const MAX_ZIP_BYTES = 4 * KIB * MIB;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const CONTENT_TYPES_PART = '[Content_Types].xml';
const OOXML_MAIN_PART: Readonly<Record<string, string>> = {
  docx: 'word/document.xml',
  xlsx: 'xl/workbook.xml',
  pptx: 'ppt/presentation.xml',
};
const TEXT_EXTENSIONS = new Set(['txt', 'md']);

function ascii(text: string): Buffer {
  return Buffer.from(text, 'latin1');
}

function startsWith(data: Buffer, prefix: Buffer): boolean {
  return data.length >= prefix.length && data.subarray(0, prefix.length).equals(prefix);
}

async function isPortableExecutable(reader: ByteReader, header: Buffer): Promise<boolean> {
  if (!startsWith(header, MZ) || header.length < DOS_HEADER_BYTES) return false;
  const peOffset = header.readUInt32LE(PE_POINTER_OFFSET);
  if (peOffset + PE.length > reader.size) return false;
  return (await reader.read(peOffset, PE.length)).equals(PE);
}

function isFatMachO(header: Buffer): boolean {
  if (!startsWith(header, FAT_MAGIC) || header.length < 2 * FAT_MAGIC.length) return false;
  const architectures = header.readUInt32BE(FAT_MAGIC.length);
  return architectures >= 1 && architectures <= FAT_MAX_ARCHITECTURES;
}

async function isExecutable(reader: ByteReader, header: Buffer): Promise<boolean> {
  return (
    EXECUTABLE_MAGICS.some((magic) => startsWith(header, magic)) ||
    isFatMachO(header) ||
    (await isPortableExecutable(reader, header))
  );
}

/** Posición del EOCD dentro de `tail`, o -1. El comentario debe terminar justo al final del archivo. */
function findEndOfCentralDirectory(tail: Buffer): number {
  for (let at = tail.length - EOCD_BYTES; at >= 0; at -= 1) {
    if (tail.readUInt32LE(at) !== ZIP_EOCD) continue;
    const commentBytes = tail.readUInt16LE(at + 20);
    if (at + EOCD_BYTES + commentBytes === tail.length) return at;
  }
  return -1;
}

interface CentralDirectory {
  readonly entries: number;
  readonly offset: number;
  readonly size: number;
}

/** Lee el EOCD por rango (últimos 22–65 557 bytes). `null` si falta, es Zip64 o apunta fuera del archivo. */
async function locateCentralDirectory(reader: ByteReader): Promise<CentralDirectory | null> {
  const tailBytes = Math.min(reader.size, EOCD_BYTES + MAX_ZIP_COMMENT_BYTES);
  const tailStart = reader.size - tailBytes;
  const tail = await reader.read(tailStart, tailBytes);
  const at = findEndOfCentralDirectory(tail);
  if (at === -1) return null;
  if (at >= ZIP64_LOCATOR_BYTES && tail.readUInt32LE(at - ZIP64_LOCATOR_BYTES) === ZIP64_LOCATOR) {
    return null;
  }
  const entries = tail.readUInt16LE(at + 10);
  const size = tail.readUInt32LE(at + 12);
  const offset = tail.readUInt32LE(at + 16);
  if (entries === UINT16_MAX || size === UINT32_MAX || offset === UINT32_MAX) return null;
  const withinFile = offset + size <= tailStart + at;
  return size <= MAX_CENTRAL_DIRECTORY_BYTES && withinFile ? { entries, offset, size } : null;
}

/** Nombres de las entradas del directorio central, sin descomprimir nada. `null` si está malformado. */
function entryNames(directory: Buffer, entries: number): Set<string> | null {
  const names = new Set<string>();
  let position = 0;
  for (let index = 0; index < entries; index += 1) {
    if (position + CENTRAL_ENTRY_BYTES > directory.length) return null;
    if (directory.readUInt32LE(position) !== ZIP_CENTRAL_ENTRY) return null;
    const nameBytes = directory.readUInt16LE(position + 28);
    const extraBytes = directory.readUInt16LE(position + 30);
    const commentBytes = directory.readUInt16LE(position + 32);
    const nameStart = position + CENTRAL_ENTRY_BYTES;
    if (nameStart + nameBytes > directory.length) return null;
    names.add(directory.toString('utf8', nameStart, nameStart + nameBytes));
    position = nameStart + nameBytes + extraBytes + commentBytes;
  }
  return names;
}

async function isOfficeOpenXml(reader: ByteReader, header: Buffer, mainPart: string) {
  if (reader.size >= MAX_ZIP_BYTES || header.length < 4) return false;
  if (header.readUInt32LE(0) !== ZIP_LOCAL_HEADER) return false;
  const directory = await locateCentralDirectory(reader);
  if (directory === null) return false;
  const names = entryNames(await reader.read(directory.offset, directory.size), directory.entries);
  return names !== null && names.has(CONTENT_TYPES_PART) && names.has(mainPart);
}

/** UTF-8 estricto por bloques (un carácter puede quedar partido entre dos), BOM permitido, sin NUL. */
async function isUtf8Text(reader: ByteReader): Promise<boolean> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (let offset = 0; offset < reader.size; offset += TEXT_CHUNK_BYTES) {
      const chunk = await reader.read(offset, Math.min(TEXT_CHUNK_BYTES, reader.size - offset));
      if (chunk.length === 0 || chunk.includes(0)) return false;
      decoder.decode(chunk, { stream: true });
    }
    decoder.decode();
    return true;
  } catch {
    return false;
  }
}

async function matchesSignature(reader: ByteReader, header: Buffer, extension: string) {
  if (extension === 'pdf') return header.includes(PDF_MARKER);
  const image = IMAGE_SIGNATURES[extension];
  if (image !== undefined) return image(header);
  const mainPart = OOXML_MAIN_PART[extension];
  if (mainPart !== undefined) return isOfficeOpenXml(reader, header, mainPart);
  return true;
}

/**
 * Detector de tipo real propio, sin dependencia (plan §6, D-9). Orden fijo: (1) ejecutables con cualquier extensión;
 * (2) la firma de la extensión del catálogo (`pdf`, imágenes, OOXML por el directorio central, texto UTF-8);
 * (3) cualquier otra extensión es `otro`, sin firma que validar.
 */
@Injectable()
export class MagicBytesDetector implements IFileTypeDetector {
  async detect(reader: ByteReader, rawExtension: string): Promise<DetectionResult> {
    const extension = rawExtension.toLowerCase();
    const header = await reader.read(0, Math.min(reader.size, HEADER_BYTES));
    if (await isExecutable(reader, header)) return { ok: false, reason: 'executable' };
    const { kind, mime } = fileKindOf(extension);
    if (TEXT_EXTENSIONS.has(extension)) {
      return (await isUtf8Text(reader)) ? { ok: true, kind, mime } : { ok: false, reason: 'text' };
    }
    return (await matchesSignature(reader, header, extension))
      ? { ok: true, kind, mime }
      : { ok: false, reason: 'signature' };
  }
}
