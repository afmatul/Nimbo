import type { FileName } from './file-name.vo';
import { ObjectKey } from './object-key';

/** Vida de una carga y de su reserva de cuota desde su creación (RN-7). Regla de dominio, no configuración. */
export const UPLOAD_TTL_HOURS = 24;
const HOUR_MS = 3_600_000;

/** Estados de `carga.estado`. Solo `activa` reserva cuota. */
export const UPLOAD_STATES = [
  'activa',
  'completada',
  'rechazada',
  'cancelada',
  'expirada',
] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

/** Modo de `carga.modo`, decidido por el servidor según el umbral (D-2). */
export type UploadMode = 'simple' | 'por_partes';

/** Motivo de `carga.motivo_rechazo`. Coincide con `REJECTION_REASONS` de `contracts/storage` (ADR-0008). */
export const UPLOAD_REJECTION_REASONS = ['tamano', 'tipo_invalido'] as const;
export type UploadRejectionReason = (typeof UPLOAD_REJECTION_REASONS)[number];

/** Datos del multipart de S3. `uploadId` nunca sale de la API ni entra en una bitácora. */
export interface MultipartUpload {
  readonly uploadId: string;
  readonly totalParts: number;
  readonly partSizeBytes: bigint;
}

export interface StartUploadInput {
  readonly id: string;
  readonly ownerId: string;
  /** Ids reservados del futuro `archivo` y de su versión: fijan la clave final desde el inicio. */
  readonly fileId: string;
  readonly versionId: string;
  readonly name: FileName;
  readonly keepBoth: boolean;
  /** Tamaño declarado: es la reserva de cuota (RN-13). */
  readonly declaredBytes: bigint;
  readonly multipart: MultipartUpload | null;
  readonly now: Date;
}

export interface UploadSessionSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly fileId: string;
  readonly versionId: string;
  readonly name: FileName;
  readonly keepBoth: boolean;
  readonly declaredBytes: bigint;
  readonly multipart: MultipartUpload | null;
  readonly state: UploadState;
  readonly rejectionReason: UploadRejectionReason | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly finishedAt: Date | null;
}

/** La aplicación pidió una transición que la máquina no admite: debe consultar `state`/`isExpired` antes. */
export class InvalidUploadTransitionError extends Error {
  constructor(from: UploadState, to: UploadState) {
    super(`La carga no puede pasar de «${from}» a «${to}».`);
    this.name = new.target.name;
  }
}

function copyDate(date: Date | null): Date | null {
  return date === null ? null : new Date(date.getTime());
}

function assertInvariants(snapshot: UploadSessionSnapshot): void {
  if (snapshot.declaredBytes <= 0n) {
    throw new TypeError('El tamaño declarado de la carga debe ser mayor que 0.');
  }
  const { multipart } = snapshot;
  if (multipart !== null && (multipart.totalParts <= 0 || multipart.partSizeBytes <= 0n)) {
    throw new TypeError('Una carga por partes necesita partes y tamaño de parte positivos.');
  }
  if ((snapshot.state === 'rechazada') !== (snapshot.rejectionReason !== null)) {
    throw new TypeError('Solo una carga rechazada lleva motivo, y siempre lo lleva.');
  }
  if (
    snapshot.rejectionReason !== null &&
    !UPLOAD_REJECTION_REASONS.includes(snapshot.rejectionReason)
  ) {
    throw new TypeError('Motivo de rechazo desconocido.');
  }
}

/**
 * Sesión de carga (`carga`), inmutable: `activa → completada | rechazada | cancelada | expirada` y ninguna otra
 * transición. Cada transición devuelve una copia nueva. Recibe «ahora» como argumento: no lee el reloj.
 */
export class UploadSession {
  private readonly data: UploadSessionSnapshot;

  private constructor(snapshot: UploadSessionSnapshot) {
    assertInvariants(snapshot);
    this.data = Object.freeze({
      ...snapshot,
      multipart: snapshot.multipart === null ? null : Object.freeze({ ...snapshot.multipart }),
      expiresAt: new Date(snapshot.expiresAt.getTime()),
      createdAt: new Date(snapshot.createdAt.getTime()),
      updatedAt: new Date(snapshot.updatedAt.getTime()),
      finishedAt: copyDate(snapshot.finishedAt),
    });
    Object.freeze(this);
  }

  static start(input: StartUploadInput): UploadSession {
    const { now, ...rest } = input;
    return new UploadSession({
      ...rest,
      state: 'activa',
      rejectionReason: null,
      expiresAt: new Date(now.getTime() + UPLOAD_TTL_HOURS * HOUR_MS),
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });
  }

  static rehydrate(snapshot: UploadSessionSnapshot): UploadSession {
    return new UploadSession(snapshot);
  }

  get id(): string {
    return this.data.id;
  }

  get ownerId(): string {
    return this.data.ownerId;
  }

  get fileId(): string {
    return this.data.fileId;
  }

  get versionId(): string {
    return this.data.versionId;
  }

  get name(): FileName {
    return this.data.name;
  }

  get keepBoth(): boolean {
    return this.data.keepBoth;
  }

  get declaredBytes(): bigint {
    return this.data.declaredBytes;
  }

  get multipart(): MultipartUpload | null {
    return this.data.multipart;
  }

  get mode(): UploadMode {
    return this.data.multipart === null ? 'simple' : 'por_partes';
  }

  /** Clave final del objeto, fijada desde el inicio: las partes se suben directo a ella. */
  get objectKey(): ObjectKey {
    return ObjectKey.of(this.data.ownerId, this.data.fileId, this.data.versionId);
  }

  get state(): UploadState {
    return this.data.state;
  }

  get rejectionReason(): UploadRejectionReason | null {
    return this.data.rejectionReason;
  }

  get expiresAt(): Date {
    return new Date(this.data.expiresAt.getTime());
  }

  get createdAt(): Date {
    return new Date(this.data.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.data.updatedAt.getTime());
  }

  get finishedAt(): Date | null {
    return copyDate(this.data.finishedAt);
  }

  /** Vencida a las 24 h de su creación (CA-9), esté o no ya marcada como `expirada`. */
  isExpired(now: Date): boolean {
    return now.getTime() >= this.data.expiresAt.getTime();
  }

  complete(now: Date): UploadSession {
    if (this.data.state === 'activa' && this.isExpired(now)) {
      throw new InvalidUploadTransitionError('activa', 'completada');
    }
    return this.finish('completada', now, null);
  }

  reject(reason: UploadRejectionReason, now: Date): UploadSession {
    if (!UPLOAD_REJECTION_REASONS.includes(reason)) {
      throw new TypeError('Motivo de rechazo desconocido.');
    }
    return this.finish('rechazada', now, reason);
  }

  cancel(now: Date): UploadSession {
    return this.finish('cancelada', now, null);
  }

  expire(now: Date): UploadSession {
    return this.finish('expirada', now, null);
  }

  snapshot(): UploadSessionSnapshot {
    return {
      ...this.data,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      finishedAt: this.finishedAt,
    };
  }

  private finish(
    to: UploadState,
    now: Date,
    rejectionReason: UploadRejectionReason | null,
  ): UploadSession {
    if (this.data.state !== 'activa') {
      throw new InvalidUploadTransitionError(this.data.state, to);
    }
    return new UploadSession({
      ...this.snapshot(),
      state: to,
      rejectionReason,
      updatedAt: now,
      finishedAt: now,
    });
  }
}
