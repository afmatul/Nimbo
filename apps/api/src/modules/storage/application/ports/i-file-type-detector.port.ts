import type { FileTypeRejectionReason } from '../../domain/errors';
import type { FileKind } from '../../domain/file-kind';

/** Lectura por rangos de un objeto ya subido. `UploadService` la alimenta con `IObjectStorage.getRange`. */
export interface ByteReader {
  readonly size: number;
  /** Hasta `length` bytes desde `offset`; menos si el objeto termina antes. */
  read(offset: number, length: number): Promise<Buffer>;
}

export type DetectionResult =
  | { readonly ok: true; readonly kind: FileKind; readonly mime: string }
  | { readonly ok: false; readonly reason: FileTypeRejectionReason };

/**
 * Valida el tipo real de un archivo (CA-11, CA-12, CA-24): ejecutables primero, sea cual sea la extensión; después la
 * firma que corresponde a la extensión (sin punto); las extensiones sin firma son `otro`.
 */
export interface IFileTypeDetector {
  detect(reader: ByteReader, extension: string): Promise<DetectionResult>;
}

export const I_FILE_TYPE_DETECTOR = Symbol('IFileTypeDetector');
