import type { FileKind } from './file-kind';
import type { FileName } from './file-name.vo';

export interface CreateFileInput {
  readonly id: string;
  readonly ownerId: string;
  /** Nombre final, ya resuelto con `FileName.firstFree` (D-4). */
  readonly name: FileName;
  readonly kind: FileKind;
  /** Tamaño de la versión actual (denormalizado, DF-33). */
  readonly sizeBytes: bigint;
  readonly currentVersionId: string;
  readonly now: Date;
}

export interface FileSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly name: FileName;
  readonly kind: FileKind;
  readonly sizeBytes: bigint;
  readonly currentVersionId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Papelera (006); en 005 siempre `null`. */
  readonly deletedAt: Date | null;
}

function copyDate(date: Date | null): Date | null {
  return date === null ? null : new Date(date.getTime());
}

/** Archivo (`archivo`), inmutable. En 005 vive siempre en la raíz del propietario (RN-4). */
export class File {
  private readonly data: FileSnapshot;

  private constructor(snapshot: FileSnapshot) {
    if (snapshot.sizeBytes <= 0n) {
      throw new TypeError('El tamaño de un archivo debe ser mayor que 0.');
    }
    this.data = Object.freeze({
      ...snapshot,
      createdAt: new Date(snapshot.createdAt.getTime()),
      updatedAt: new Date(snapshot.updatedAt.getTime()),
      deletedAt: copyDate(snapshot.deletedAt),
    });
    Object.freeze(this);
  }

  static create(input: CreateFileInput): File {
    const { now, ...rest } = input;
    return new File({ ...rest, createdAt: now, updatedAt: now, deletedAt: null });
  }

  static rehydrate(snapshot: FileSnapshot): File {
    return new File(snapshot);
  }

  get id(): string {
    return this.data.id;
  }

  get ownerId(): string {
    return this.data.ownerId;
  }

  get name(): FileName {
    return this.data.name;
  }

  get kind(): FileKind {
    return this.data.kind;
  }

  get sizeBytes(): bigint {
    return this.data.sizeBytes;
  }

  get currentVersionId(): string {
    return this.data.currentVersionId;
  }

  get createdAt(): Date {
    return new Date(this.data.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.data.updatedAt.getTime());
  }

  get deletedAt(): Date | null {
    return copyDate(this.data.deletedAt);
  }

  snapshot(): FileSnapshot {
    return {
      ...this.data,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      deletedAt: this.deletedAt,
    };
  }
}
