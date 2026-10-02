import { categoryOf, type FileCategory } from './file-category';
import type { FileKind } from './file-kind';

type BytesByCategory = Record<FileCategory, bigint>;

const assertNonNegative = (bytes: bigint): void => {
  if (bytes < 0n) throw new TypeError('Los bytes del desglose no pueden ser negativos.');
};

const sumByCategory = (bytesByKind: ReadonlyMap<FileKind, bigint>): BytesByCategory => {
  const totals: BytesByCategory = { documents: 0n, images: 0n, other: 0n };
  for (const [kind, bytes] of bytesByKind) {
    assertNonNegative(bytes);
    totals[categoryOf(kind)] += bytes;
  }
  return totals;
};

/**
 * Desglose del espacio de una cuenta (spec 007 CA-2, CA-3), inmutable: bytes de los archivos vivos por categoría y,
 * aparte, los de la papelera hasta su purga. La suma es el espacio usado (RN-2).
 */
export class SpaceBreakdown {
  private constructor(
    readonly documentsBytes: bigint,
    readonly imagesBytes: bigint,
    readonly otherBytes: bigint,
    readonly trashBytes: bigint,
  ) {
    Object.freeze(this);
  }

  /** Agrupa los bytes de los archivos vivos por tipo en sus categorías y agrega los de la papelera. */
  static fromBytesByKind(
    bytesByKind: ReadonlyMap<FileKind, bigint>,
    trashBytes: bigint,
  ): SpaceBreakdown {
    assertNonNegative(trashBytes);
    const totals = sumByCategory(bytesByKind);
    return new SpaceBreakdown(totals.documents, totals.images, totals.other, trashBytes);
  }

  get totalBytes(): bigint {
    return this.documentsBytes + this.imagesBytes + this.otherBytes + this.trashBytes;
  }
}
