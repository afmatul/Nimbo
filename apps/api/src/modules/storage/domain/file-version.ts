import type { ObjectKey } from './object-key';

/** Orígenes de `version_archivo.origen` (ADR-0012). */
export const FILE_VERSION_ORIGINS = ['carga', 'edicion', 'restauracion', 'optimizacion'] as const;
export type FileVersionOrigin = (typeof FILE_VERSION_ORIGINS)[number];

/**
 * Origen que registra 021 (`optimizacion`) con la misma forma que una carga (CA-5). La edición (016) va por
 * `fromEdit`: además lleva su sesión (`ck_version_archivo_sesion_origen`).
 */
export type GeneratedVersionOrigin = Extract<FileVersionOrigin, 'optimizacion'>;

/** Datos de una versión nueva con contenido propio. `number` lo asigna quien registra (RN-4). */
export interface NewVersionInput {
  readonly id: string;
  readonly fileId: string;
  readonly objectKey: ObjectKey;
  /** Tamaño real del objeto, medido al completar. */
  readonly sizeBytes: bigint;
  readonly createdBy: string;
  readonly number: number;
  readonly now: Date;
}

/** Datos de una versión de edición (016): los de una carga más la sesión que la generó (1:0..1, DF-39). */
export interface EditedVersionData extends NewVersionInput {
  readonly editSessionId: string;
}

/** Datos de una restauración: el archivo y el tamaño salen de la versión de origen; la clave es la de la copia. */
export type RestorationInput = Omit<NewVersionInput, 'fileId' | 'sizeBytes'>;

export interface FileVersionSnapshot {
  readonly id: string;
  readonly fileId: string;
  readonly number: number;
  readonly origin: FileVersionOrigin;
  /** Número de la versión restaurada; sobrevive a su poda porque los números no se reutilizan (RN-4). */
  readonly restoredFromNumber: number | null;
  readonly objectKey: ObjectKey;
  readonly sizeBytes: bigint;
  readonly createdBy: string;
  readonly createdAt: Date;
  /** Sesión de edición que la generó (`sesion_edicion_id`); solo y siempre en las de origen `edicion` (016). */
  readonly editSessionId: string | null;
}

/** Mismas reglas que `ck_version_numero` y `ck_version_archivo_sesion_origen`. */
function assertInvariants(snapshot: FileVersionSnapshot): void {
  if ((snapshot.origin === 'edicion') !== (snapshot.editSessionId !== null)) {
    throw new TypeError('Solo una versión de edición tiene sesión de edición, y siempre la tiene.');
  }
  if (snapshot.sizeBytes <= 0n) {
    throw new TypeError('El tamaño de una versión debe ser mayor que 0.');
  }
  if (!Number.isInteger(snapshot.number) || snapshot.number < 1) {
    throw new TypeError('El número de una versión debe ser un entero positivo.');
  }
  const from = snapshot.restoredFromNumber;
  if (from !== null && (!Number.isInteger(from) || from < 1 || from >= snapshot.number)) {
    throw new TypeError('Una restauración debe venir de una versión con número anterior.');
  }
}

/** Versión de un archivo (`version_archivo`), inmutable (RN-2). La clave de objeto nunca sale de la API. */
export class FileVersion {
  private readonly data: FileVersionSnapshot;

  private constructor(snapshot: FileVersionSnapshot) {
    assertInvariants(snapshot);
    this.data = Object.freeze({ ...snapshot, createdAt: new Date(snapshot.createdAt.getTime()) });
    Object.freeze(this);
  }

  /** Versión creada por una carga completada: la primera o un reemplazo (RF-08, CA-1). */
  static fromUpload(input: NewVersionInput): FileVersion {
    return FileVersion.create('carga', input);
  }

  /** Versión creada por una optimización (021). */
  static forOrigin(origin: GeneratedVersionOrigin, input: NewVersionInput): FileVersion {
    return FileVersion.create(origin, input);
  }

  /** Versión creada al guardar una sesión de edición (016 CA-9, ADR-0012). */
  static fromEdit(input: EditedVersionData): FileVersion {
    const { now, editSessionId, ...rest } = input;
    return new FileVersion({
      ...rest,
      origin: 'edicion',
      restoredFromNumber: null,
      editSessionId,
      createdAt: now,
    });
  }

  /** Versión nueva con el contenido de `source` (CA-9): `source` no cambia. */
  static fromRestoration(source: FileVersion, input: RestorationInput): FileVersion {
    const { now, ...rest } = input;
    return new FileVersion({
      ...rest,
      fileId: source.fileId,
      sizeBytes: source.sizeBytes,
      origin: 'restauracion',
      restoredFromNumber: source.number,
      editSessionId: null,
      createdAt: now,
    });
  }

  static rehydrate(snapshot: FileVersionSnapshot): FileVersion {
    return new FileVersion(snapshot);
  }

  private static create(origin: FileVersionOrigin, input: NewVersionInput): FileVersion {
    const { now, ...rest } = input;
    return new FileVersion({
      ...rest,
      origin,
      restoredFromNumber: null,
      editSessionId: null,
      createdAt: now,
    });
  }

  get id(): string {
    return this.data.id;
  }

  get fileId(): string {
    return this.data.fileId;
  }

  get number(): number {
    return this.data.number;
  }

  get origin(): FileVersionOrigin {
    return this.data.origin;
  }

  get restoredFromNumber(): number | null {
    return this.data.restoredFromNumber;
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

  get editSessionId(): string | null {
    return this.data.editSessionId;
  }

  snapshot(): FileVersionSnapshot {
    return { ...this.data, createdAt: this.createdAt };
  }
}
