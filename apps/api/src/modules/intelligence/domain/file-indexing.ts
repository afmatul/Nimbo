import { IndexingNotRetryableError } from './errors/indexing-not-retryable.error';

/** Estados de `indexacion.estado` (`CHECK` de la migración; los mismos de `@nimbo/contracts`, que el dominio no importa). */
export const INDEXING_STATES = [
  'pendiente',
  'indexando',
  'indexado',
  'no_indexable',
  'fallido',
] as const;
export type IndexingState = (typeof INDEXING_STATES)[number];

/** Por qué una versión es `no_indexable`: reintentar no lo cambia (RN-7). */
export const UNINDEXABLE_REASONS = [
  'sin_texto',
  'formato_no_soportado',
  'demasiado_grande',
] as const;
export type UnindexableReason = (typeof UNINDEXABLE_REASONS)[number];

/** Por qué una indexación quedó `fallido`: se puede reintentar (RN-6, CA-12, CA-13). */
export const FAILURE_REASONS = [
  'proveedor_no_disponible',
  'lectura_fallida',
  'error_interno',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

/** Motivos de `indexacion.motivo`, en el orden de `@nimbo/contracts`. */
export const INDEXING_REASONS = [...UNINDEXABLE_REASONS, ...FAILURE_REASONS] as const;
export type IndexingReason = UnindexableReason | FailureReason;

export interface PendingIndexingInput {
  readonly id: string;
  readonly fileId: string;
  readonly versionId: string;
  readonly now: Date;
}

/** Cierre de un intento: cuánto tardó (si se midió) y cuándo terminó. */
export interface IndexingResult {
  readonly durationMs: number | null;
  readonly now: Date;
}

export interface IndexingCompletion extends IndexingResult {
  readonly fragmentCount: number;
}

export interface FileIndexingSnapshot extends Omit<PendingIndexingInput, 'now'> {
  readonly state: IndexingState;
  readonly reason: IndexingReason | null;
  readonly attempts: number;
  readonly fragmentCount: number;
  readonly durationMs: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Motivos admitidos por estado: solo `no_indexable` y `fallido` llevan motivo, cada uno de su lista. */
const REASONS_OF: Readonly<Record<IndexingState, readonly IndexingReason[]>> = {
  pendiente: [],
  indexando: [],
  indexado: [],
  no_indexable: UNINDEXABLE_REASONS,
  fallido: FAILURE_REASONS,
};

/**
 * Desde qué estados se llega a cada uno. `indexando → indexando` es el reclamo de un trabajo recuperado tras una caída
 * del `worker` (plan §7 punto 8); `pendiente → fallido`, agotar los intentos antes de reclamar. `indexado` y
 * `no_indexable` son finales: una versión nueva es otra fila (RN-1, RN-10).
 */
const ALLOWED_FROM: Readonly<Record<IndexingState, readonly IndexingState[]>> = {
  pendiente: ['fallido'],
  indexando: ['pendiente', 'indexando'],
  indexado: ['indexando'],
  no_indexable: ['indexando'],
  fallido: ['pendiente', 'indexando'],
};

/** Estados que todavía esperan al `worker`. */
const AWAITING_WORKER: readonly IndexingState[] = ['pendiente', 'indexando'];

const isCount =(value: number): boolean => Number.isInteger(value) && value >= 0;

/** Mismas reglas que los `CHECK` de la tabla, más la correspondencia entre estado y motivo. */
function assertInvariants(snapshot: FileIndexingSnapshot): void {
  const allowed = REASONS_OF[snapshot.state];
  const reasonFits =
    snapshot.reason === null ? allowed.length === 0 : allowed.includes(snapshot.reason);
  if (!reasonFits) {
    throw new TypeError(
      'Solo `no_indexable` y `fallido` llevan motivo, y siempre uno de su lista.',
    );
  }
  const durationFits = snapshot.durationMs === null || isCount(snapshot.durationMs);
  if (!isCount(snapshot.attempts) || !isCount(snapshot.fragmentCount) || !durationFits) {
    throw new TypeError('Intentos, fragmentos y duración son enteros no negativos.');
  }
}

/**
 * Estado de indexación de una versión de archivo (M6, `indexacion`; una fila por versión), inmutable: cada transición
 * devuelve otro. Una transición inválida es un error de programación (`TypeError`), salvo «Reintentar» fuera de
 * `fallido`, que el cliente puede pedir (409). El repositorio repite la comprobación en la BD (CAS) para las carreras.
 */
export class FileIndexing {
  private readonly data: FileIndexingSnapshot;

  private constructor(snapshot: FileIndexingSnapshot) {
    assertInvariants(snapshot);
    this.data = Object.freeze({
      ...snapshot,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    });
    Object.freeze(this);
  }

  /** Versión recién creada de un tipo indexable (CA-8). */
  static pending(input: PendingIndexingInput): FileIndexing {
    const { now, ...rest } = input;
    return new FileIndexing({
      ...rest,
      state: 'pendiente',
      reason: null,
      attempts: 0,
      fragmentCount: 0,
      durationMs: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(snapshot: FileIndexingSnapshot): FileIndexing {
    return new FileIndexing(snapshot);
  }

  /** El `worker` toma la versión: cuenta un intento. */
  claim(now: Date): FileIndexing {
    return this.moveTo({ state: 'indexando', updatedAt: now, attempts: this.data.attempts + 1 });
  }

  /** Fragmentos guardados (CA-1, CA-9). */
  complete(completion: IndexingCompletion): FileIndexing {
    const { fragmentCount, durationMs, now } = completion;
    return this.moveTo({ state: 'indexado', fragmentCount, durationMs, updatedAt: now });
  }

  /** Sin texto, formato no soportado o demasiado grande (CA-4, CA-5, RN-7). */
  markUnindexable(reason: UnindexableReason, result: IndexingResult): FileIndexing {
    return this.moveTo({
      state: 'no_indexable',
      reason,
      durationMs: result.durationMs,
      updatedAt: result.now,
    });
  }

  /** Intentos agotados o error no reintentable (CA-12). */
  fail(reason: FailureReason, result: IndexingResult): FileIndexing {
    return this.moveTo({
      state: 'fallido',
      reason,
      durationMs: result.durationMs,
      updatedAt: result.now,
    });
  }

  /** «Reintentar» (CA-13): vuelve a `pendiente` con los intentos en cero. */
  retry(now: Date): FileIndexing {
    if (!this.isRetryable) {
      throw new IndexingNotRetryableError();
    }
    return this.moveTo({ state: 'pendiente', attempts: 0, durationMs: null, updatedAt: now });
  }

  get isRetryable(): boolean {
    return this.data.state === 'fallido';
  }

  /** `pendiente` o `indexando`: el `worker` puede reclamarla y volver a encolarla no duplica nada (`jobId` = versión). */
  get isAwaitingWorker(): boolean {
    return AWAITING_WORKER.includes(this.data.state);
  }

  get id(): string {
    return this.data.id;
  }

  get fileId(): string {
    return this.data.fileId;
  }

  get versionId(): string {
    return this.data.versionId;
  }

  get state(): IndexingState {
    return this.data.state;
  }

  get reason(): IndexingReason | null {
    return this.data.reason;
  }

  snapshot(): FileIndexingSnapshot {
    return {
      ...this.data,
      createdAt: new Date(this.data.createdAt),
      updatedAt: new Date(this.data.updatedAt),
    };
  }

  /** El motivo se limpia salvo que el cambio traiga uno. */
  private moveTo(change: Partial<FileIndexingSnapshot> & { state: IndexingState }): FileIndexing {
    if (!ALLOWED_FROM[change.state].includes(this.data.state)) {
      throw new TypeError(
        `Una indexación \`${this.data.state}\` no puede pasar a \`${change.state}\`.`,
      );
    }
    return new FileIndexing({ ...this.data, reason: null, ...change });
  }
}
