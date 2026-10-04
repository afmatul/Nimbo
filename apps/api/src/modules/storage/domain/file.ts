import type { FileKind } from './file-kind';
import type { FileName } from './file-name.vo';
import type { TrashState } from './trash-state';

export interface CreateFileInput {
  readonly id: string;
  readonly ownerId: string;
  /** Carpeta que lo contiene; `null` es la raíz del propietario (006). */
  readonly folderId: string | null;
  /** Nombre final, ya resuelto con `FileName.firstFree` en su carpeta (D-4). */
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
  readonly folderId: string | null;
  readonly name: FileName;
  readonly kind: FileKind;
  readonly sizeBytes: bigint;
  readonly currentVersionId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** `null` mientras está vivo (RN-4). */
  readonly trash: TrashState | null;
}

/** Archivo (`archivo`), inmutable. Junto con `Folder` forma `StorageNode` (DF-61). */
export class File {
  readonly type = 'file' as const;
  private readonly data: FileSnapshot;

  private constructor(snapshot: FileSnapshot) {
    if (snapshot.sizeBytes <= 0n) {
      throw new TypeError('El tamaño de un archivo debe ser mayor que 0.');
    }
    this.data = Object.freeze({
      ...snapshot,
      createdAt: new Date(snapshot.createdAt.getTime()),
      updatedAt: new Date(snapshot.updatedAt.getTime()),
    });
    Object.freeze(this);
  }

  static create(input: CreateFileInput): File {
    const { now, ...rest } = input;
    return new File({ ...rest, createdAt: now, updatedAt: now, trash: null });
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

  get folderId(): string | null {
    return this.data.folderId;
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

  get trash(): TrashState | null {
    return this.data.trash;
  }

  snapshot(): FileSnapshot {
    return { ...this.data, createdAt: this.createdAt, updatedAt: this.updatedAt };
  }
}
