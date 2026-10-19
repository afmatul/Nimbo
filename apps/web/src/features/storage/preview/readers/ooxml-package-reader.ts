import { ObjectRangeReader } from './ooxml-range-reader';
import * as zip from './zip-core';

export type OoxmlFailureReason = 'corrupt' | 'protected' | 'unavailable' | 'memory';

/** Única excepción del lector OOXML: solo una razón cerrada y un mensaje fijo, sin causa ni detalles. */
export class OoxmlError extends Error {
  readonly reason: OoxmlFailureReason;
  constructor(reason: OoxmlFailureReason) {
    super('No se pudo leer el paquete OOXML.');
    this.reason = reason;
  }
}

export type ZipPackage = {
  /** Nombre de parte OPC (`/xl/workbook.xml`); la equivalencia es ASCII sin distinguir mayúsculas. */
  readonly has: (partName: string) => boolean;
  /** Lectura secuencial; la señal opcional cancela solo esta parte, además de la señal del paquete. */
  readonly readPart: (
    partName: string,
    onChunk: (chunk: Uint8Array) => void,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly close: () => Promise<void>;
};

type PackageSource = { readonly url: string; readonly signal: AbortSignal };
type Archive = { readonly zip: zip.ZipReader<string>; readonly reader: ObjectRangeReader };

const PROTECTED = new Set([
  zip.ERR_ENCRYPTED,
  zip.ERR_ENCRYPTED_CENTRAL_DIRECTORY,
  zip.ERR_INVALID_PASSWORD,
  zip.ERR_UNSUPPORTED_ENCRYPTION,
]);
const CORRUPT = new Set([
  zip.ERR_AMBIGUOUS_ARCHIVE,
  zip.ERR_BAD_FORMAT,
  zip.ERR_CENTRAL_DIRECTORY_NOT_FOUND,
  zip.ERR_ENTRY_DATA_OUT_OF_BOUNDS,
  zip.ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND,
  zip.ERR_EOCDR_NOT_FOUND,
  zip.ERR_EXTRAFIELD_ZIP64_NOT_FOUND,
  zip.ERR_INVALID_COMPRESSED_DATA,
  zip.ERR_INVALID_CRC32,
  zip.ERR_INVALID_UNCOMPRESSED_SIZE,
  zip.ERR_LOCAL_FILE_HEADER_NOT_FOUND,
  zip.ERR_OVERLAPPING_ENTRY,
  zip.ERR_SPLIT_ZIP_FILE,
  zip.ERR_UNSAFE_FILENAME,
  zip.ERR_UNSUPPORTED_COMPRESSION,
  zip.ERR_UNSUPPORTED_UINT64,
]);

/** Solo constantes publicadas por zip.js: un error desconocido nunca se adivina como corrupto ni memoria. */
function classify(error: unknown, reader: ObjectRangeReader): OoxmlError {
  if (error instanceof OoxmlError) return error;
  if (reader.failed || !(error instanceof Error)) return new OoxmlError('unavailable');
  if (PROTECTED.has(error.message)) return new OoxmlError('protected');
  if (error.message === zip.ERR_CODEC_OUT_OF_MEMORY) return new OoxmlError('memory');
  return new OoxmlError(CORRUPT.has(error.message) ? 'corrupt' : 'unavailable');
}

/** ECMA-376-2 §6.2.2.3 [M1.12]: nombres de parte equivalentes por ASCII sin mayúsculas no pueden coexistir. */
export function partKey(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

const ZIP_OPTIONS = {
  strictness: 'strict',
  filenameValidation: 'strict',
  checkCrc32: true,
  checkOverlappingEntry: true,
  useWebWorkers: false,
} as const;

async function indexEntries(archive: Archive): Promise<Map<string, zip.FileEntry>> {
  const entries = new Map<string, zip.FileEntry>();
  for await (const entry of archive.zip.getEntriesGenerator()) {
    if (entry.directory) continue;
    if (entry.encrypted) throw new OoxmlError('protected');
    const key = partKey(`/${entry.filename}`);
    if (entries.has(key)) throw new OoxmlError('corrupt');
    entries.set(key, entry);
  }
  return entries;
}

async function readEntry(
  entry: zip.FileEntry | undefined,
  onChunk: (chunk: Uint8Array) => void,
  signal: AbortSignal,
): Promise<void> {
  if (entry === undefined) throw new OoxmlError('corrupt');
  const sink = new WritableStream<Uint8Array>({ write: (chunk) => onChunk(chunk) });
  await entry.getData(sink, { ...ZIP_OPTIONS, signal });
}

function combinedSignalOf(packageSignal: AbortSignal, unitSignal?: AbortSignal) {
  if (unitSignal === undefined) return { signal: packageSignal, cleanup: () => undefined };
  const controller = new AbortController();
  const signals = [packageSignal, unitSignal];
  const abort = (): void => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of signals) signal.removeEventListener('abort', abort);
    },
  };
}

/** Solo se clasifican errores de zip.js/transporte; lo que lanza el consumidor llega intacto. */
function readPartOf(archive: Archive, entries: Map<string, zip.FileEntry>, signal: AbortSignal) {
  return async (
    partName: string,
    onChunk: (chunk: Uint8Array) => void,
    unit?: AbortSignal,
  ): Promise<void> => {
    const { signal: readingSignal, cleanup } = combinedSignalOf(signal, unit);
    let consumerFailed = false;
    let consumerError: unknown;
    const consume = (chunk: Uint8Array): void => {
      try {
        onChunk(chunk);
      } catch (error) {
        consumerFailed = true;
        consumerError = error;
        throw error;
      }
    };
    await archive.reader
      .withSignal(readingSignal, () =>
        readEntry(entries.get(partKey(partName)), consume, readingSignal),
      )
      .catch((error: unknown) => {
        throw consumerFailed ? consumerError : classify(error, archive.reader);
      })
      .finally(cleanup);
  };
}

function packageOf(archive: Archive, entries: Map<string, zip.FileEntry>, signal: AbortSignal) {
  let closing: Promise<void> | undefined;
  const pkg: ZipPackage = {
    has: (partName) => entries.has(partKey(partName)),
    readPart: readPartOf(archive, entries, signal),
    close: () => {
      closing ??= archive.zip.close().catch(() => undefined);
      entries.clear();
      return closing;
    },
  };
  return pkg;
}

/** Abre el ZIP leyendo solo su cola y el directorio central; las partes se leen después, en streaming. */
export async function openZipPackage(source: PackageSource): Promise<ZipPackage> {
  const reader = new ObjectRangeReader(source);
  const archive: Archive = {
    reader,
    zip: new zip.ZipReader(reader, { ...ZIP_OPTIONS, signal: source.signal }),
  };
  try {
    return packageOf(archive, await indexEntries(archive), source.signal);
  } catch (error) {
    await archive.zip.close().catch(() => undefined);
    throw classify(error, reader);
  }
}
