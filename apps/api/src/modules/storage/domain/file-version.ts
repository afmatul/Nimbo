import type { ObjectKey } from './object-key';

/** Orígenes de `version_archivo.origen` (ADR-0012). En 005 solo se crean versiones `carga`. */
export const FILE_VERSION_ORIGINS = ['carga', 'edicion', 'restauracion', 'optimizacion'] as const;
export type FileVersionOrigin = (typeof FILE_VERSION_ORIGINS)[number];

export interface UploadedVersionInput {
  readonly id: string;
  readonly fileId: string;
  readonly objectKey: ObjectKey;
  /** Tamaño real del objeto, medido al completar. */
  readonly sizeBytes: bigint;
  readonly createdBy: string;
  readonly now: Date;
}

export interface FileVersionSnapshot {
  readonly id: string;
  readonly fileId: string;
  readonly origin: FileVersionOrigin;
  readonly objectKey: ObjectKey;
  readonly sizeBytes: bigint;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** Versión de un archivo (`version_archivo`), inmutable. La clave de objeto nunca sale de la API. */
export class FileVersion {
  private readonly data: FileVersionSnapshot;

  private constructor(snapshot: FileVersionSnapshot) {
    if (snapshot.sizeBytes <= 0n) {
      throw new TypeError('El tamaño de una versión debe ser mayor que 0.');
    }
    this.data = Object.freeze({ ...snapshot, createdAt: new Date(snapshot.createdAt.getTime()) });
    Object.freeze(this);
  }

  /** Versión creada por una carga completada (RF-08). */
  static fromUpload(input: UploadedVersionInput): FileVersion {
    const { now, ...rest } = input;
    return new FileVersion({ ...rest, origin: 'carga', createdAt: now });
  }

  static rehydrate(snapshot: FileVersionSnapshot): FileVersion {
    return new FileVersion(snapshot);
  }

  get id(): string {
    return this.data.id;
  }

  get fileId(): string {
    return this.data.fileId;
  }

  get origin(): FileVersionOrigin {
    return this.data.origin;
  }

  get objectKey(): ObjectKey {
    return this.data.objectKey;
  }

  get sizeBytes(): bigint {
    return this.data.sizeBytes;
  }

  get createdBy(): string {
    return this.data.createdBy;
  }

  get createdAt(): Date {
    return new Date(this.data.createdAt.getTime());
  }

  snapshot(): FileVersionSnapshot {
    return { ...this.data, createdAt: this.createdAt };
  }
}
