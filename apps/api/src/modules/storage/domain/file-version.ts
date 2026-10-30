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
  /**
   * Fecha de purga de un original conservado por una optimización (014b, ADR-0013); `null` = cuenta en `espacio_usado`.
   * Un original conservado no cuenta en el espacio y vence en esa fecha.
   */
  readonly keptUntil: Date | null;
}

const DAY_MS = 86_400_000;

const copyDate = (date: Date | null): Date | null =>
  date === null ? null : new Date(date.getTime());

/** Mismas reglas que `ck_version_numero`, `ck_version_archivo_sesion_origen` y `ck_version_conservada_hasta`. */
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
  if (snapshot.keptUntil !== null && snapshot.keptUntil <= snapshot.createdAt) {
    throw new TypeError('Un original se conserva hasta después de su creación.');
  }
}

/** Reglas de 014b para conservar `original` por la optimización `optimized` (CA-3, RN-2, RN-3). */
function assertConservable(
  original: FileVersion,
  optimized: FileVersion,
  retentionDays: number,
): void {
  if (optimized.origin !== 'optimizacion' || optimized.fileId !== original.fileId) {
    throw new TypeError('Solo una optimización del mismo archivo conserva el original.');
  }
  if (optimized.sizeBytes >= original.sizeBytes) {
    throw new TypeError('La versión optimizada debe ser menor que el original.');
  }
  if (!original.countsInQuota) {
    throw new TypeError('El original ya estaba conservado.');
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new TypeError('Los días de conservación deben ser un entero positivo.');
  }
}

/** Versión de un archivo (`version_archivo`), inmutable (RN-2). La clave de objeto nunca sale de la API. */
export class FileVersion {
  private readonly data: FileVersionSnapshot;

  private constructor(snapshot: FileVersionSnapshot) {
    assertInvariants(snapshot);
    this.data = Object.freeze({
      ...snapshot,
      createdAt: new Date(snapshot.createdAt.getTime()),
      keptUntil: copyDate(snapshot.keptUntil),
    });
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
      keptUntil: null,
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
      keptUntil: null,
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
      keptUntil: null,
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

  get keptUntil(): Date | null {
    return copyDate(this.data.keptUntil);
  }

  /** Si suma en `espacio_usado`: toda versión salvo un original conservado (014b RN-1, RN-7). */
  get countsInQuota(): boolean {
    return this.data.keptUntil === null;
  }

  /**
   * Esta versión, la actual, como original conservado por `optimized` (014b CA-1, RN-3): deja de contar y vence
   * `retentionDays` días después del registro de la optimización. Rechaza lo que no ahorra espacio (CA-3, RN-2).
   */
  conserveAsOriginal(optimized: FileVersion, retentionDays: number): FileVersion {
    assertConservable(this, optimized, retentionDays);
    const keptUntil = new Date(optimized.createdAt.getTime() + retentionDays * DAY_MS);
    return new FileVersion({ ...this.data, keptUntil });
  }

  snapshot(): FileVersionSnapshot {
    return { ...this.data, createdAt: this.createdAt, keptUntil: this.keptUntil };
  }
}
