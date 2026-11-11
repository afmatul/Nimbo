import { SavingsEstimate } from './savings-estimate';
import type { SavingsThreshold } from './savings-estimate';

/** Estados de `optimizacion.estado` (`CHECK` de la migración; los mismos de `@nimbo/contracts`, que el dominio no importa). */
export const OPTIMIZATION_STATES = [
  'estimando',
  'estimada',
  'no_conviene',
  'no_disponible',
  'optimizando',
  'completada',
  'descartada',
  'fallida',
] as const;
export type OptimizationState = (typeof OPTIMIZATION_STATES)[number];

/** Motivos de `optimizacion.motivo`, en el orden de `@nimbo/contracts`. */
export const OPTIMIZATION_REASONS = [
  'tamano',
  'pixeles',
  'animada',
  'ilegible',
  'ahorro_minimo',
  'version_cambiada',
  'archivo_eliminado',
  'integridad',
  'servicio_no_disponible',
] as const;
export type OptimizationReason = (typeof OPTIMIZATION_REASONS)[number];

/** Lo que el `worker` no puede calcular (CA-5); `tamano` lo decide el `api` al pedir (`unavailableBySize`). */
export type UnavailableReason = Extract<OptimizationReason, 'pixeles' | 'animada' | 'ilegible'>;
export type DiscardReason = Extract<
  OptimizationReason,
  'ahorro_minimo' | 'version_cambiada' | 'archivo_eliminado'
>;

/** Motivos que admite cada estado; los que no figuran no llevan motivo (`ck_optimizacion_motivo`). */
const REASONS_OF: Readonly<Partial<Record<OptimizationState, readonly OptimizationReason[]>>> = {
  no_disponible: ['tamano', 'pixeles', 'animada', 'ilegible'],
  descartada: ['ahorro_minimo', 'version_cambiada', 'archivo_eliminado'],
  fallida: ['integridad', 'servicio_no_disponible'],
};

/** Estados que esperan al `worker`: a lo sumo uno por archivo (`uq_optimizacion_en_curso`, RN-9). */
export const IN_PROGRESS_STATES: readonly OptimizationState[] = ['estimando', 'optimizando'];

/** Resultados de una estimación: describen la versión de la que se calcularon. */
const ESTIMATE_RESULTS: readonly OptimizationState[] = ['estimada', 'no_conviene', 'no_disponible'];

export interface NewOptimizationInput {
  readonly id: string;
  readonly fileId: string;
  readonly sourceVersionId: string;
  /** Tamaño de la versión de origen. */
  readonly originalBytes: bigint;
  readonly now: Date;
}

export interface OptimizationJobSnapshot {
  readonly id: string;
  readonly fileId: string;
  readonly sourceVersionId: string;
  readonly resultVersionId: string | null;
  readonly state: OptimizationState;
  readonly reason: OptimizationReason | null;
  readonly originalBytes: bigint;
  readonly estimatedBytes: bigint | null;
  readonly resultBytes: bigint | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const isPositive = (bytes: bigint | null): boolean => bytes === null || bytes > 0n;

/** Mismas reglas que los `CHECK` de la tabla, más la correspondencia entre estado y motivo. */
function assertInvariants(snapshot: OptimizationJobSnapshot): void {
  const allowed = REASONS_OF[snapshot.state];
  const reasonFits =
    allowed === undefined
      ? snapshot.reason === null
      : snapshot.reason !== null && allowed.includes(snapshot.reason);
  if (!reasonFits) {
    throw new TypeError(
      'Solo `no_disponible`, `descartada` y `fallida` llevan motivo, y siempre uno de su lista.',
    );
  }
  const { originalBytes, estimatedBytes, resultBytes } = snapshot;
  if (originalBytes <= 0n || !isPositive(estimatedBytes) || !isPositive(resultBytes)) {
    throw new TypeError('Los tamaños de una optimización son positivos.');
  }
  assertResult(snapshot);
}

/** La versión se preasigna al confirmar; solo una ejecución puede tener bytes reales. */
function assertResult(data: OptimizationJobSnapshot): void {
  const runState = ['optimizando', 'completada', 'descartada'].includes(data.state);
  const hasVersion = data.resultVersionId !== null;
  if ((runState && !hasVersion) || (hasVersion && !runState && data.state !== 'fallida'))
    throw new TypeError('La versión de resultado pertenece solo a una ejecución confirmada.');
  if ((runState || data.state === 'estimada' || hasVersion) && data.estimatedBytes === null)
    throw new TypeError('Una ejecución requiere una estimación previa.');
  if (data.resultBytes !== null && !['completada', 'descartada'].includes(data.state))
    throw new TypeError('Solo un resultado completado o descartado lleva bytes reales.');
  if (
    data.state === 'completada' &&
    (data.resultBytes === null || data.resultBytes >= data.originalBytes)
  )
    throw new TypeError('Una optimización completada siempre tiene un resultado menor.');
}

/**
 * Una optimización de un archivo (M7, `OptimizationJob`, tabla `optimizacion`; plan 021 §3), inmutable: cada
 * transición devuelve otra. Una transición inválida es un error de programación (`TypeError`); el repositorio repite la
 * comprobación en la BD para las carreras. Los estados finales no se reabren: un pedido nuevo es otra fila.
 */
export class OptimizationJob {
  private readonly data: OptimizationJobSnapshot;

  private constructor(snapshot: OptimizationJobSnapshot) {
    assertInvariants(snapshot);
    this.data = Object.freeze({
      ...snapshot,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    });
    Object.freeze(this);
  }

  /** Pedido de cálculo de ahorro (CA-1): queda `estimando` hasta que el `worker` lo resuelva. */
  static startEstimate(input: NewOptimizationInput): OptimizationJob {
    return OptimizationJob.create(input, 'estimando', null);
  }

  /** Por encima del tope de bytes no se calcula: nace final en `no_disponible(tamano)` (CA-5, RN-8). */
  static unavailableBySize(input: NewOptimizationInput): OptimizationJob {
    return OptimizationJob.create(input, 'no_disponible', 'tamano');
  }

  static rehydrate(snapshot: OptimizationJobSnapshot): OptimizationJob {
    return new OptimizationJob(snapshot);
  }

  private static create(
    { now, ...input }: NewOptimizationInput,
    state: OptimizationState,
    reason: OptimizationReason | null,
  ): OptimizationJob {
    return new OptimizationJob({
      ...input,
      resultVersionId: null,
      state,
      reason,
      estimatedBytes: null,
      resultBytes: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.data.id;
  }

  get fileId(): string {
    return this.data.fileId;
  }

  get sourceVersionId(): string {
    return this.data.sourceVersionId;
  }

  get originalBytes(): bigint {
    return this.data.originalBytes;
  }

  get resultVersionId(): string | null {
    return this.data.resultVersionId;
  }

  get state(): OptimizationState {
    return this.data.state;
  }

  get reason(): OptimizationReason | null {
    return this.data.reason;
  }

  /** Espera al `worker` (`estimando` u `optimizando`). */
  get isInProgress(): boolean {
    return IN_PROGRESS_STATES.includes(this.data.state);
  }

  /**
   * Caducidad perezosa (plan 021 §5): en curso y sin novedades durante más de `windowMs`. Un trabajo vivo renueva
   * `actualizado_en` al reclamarlo, así que esto solo alcanza a uno perdido.
   */
  isStale(now: Date, windowMs: number): boolean {
    return this.isInProgress && now.getTime() - this.data.updatedAt.getTime() > windowMs;
  }

  /**
   * El `worker` la toma (plan 021 §5): mismo estado y `actualizado_en` renovado, así la caducidad perezosa no alcanza a
   * un trabajo vivo y otro `worker` con la lectura anterior pierde el comparar y asignar.
   */
  claim(now: Date): OptimizationJob {
    if (!this.isInProgress) {
      throw new TypeError('Solo se reclama una optimización en curso.');
    }
    return this.with({ updatedAt: now });
  }

  /**
   * Resultado de la estimación (CA-1, CA-2): `estimada` si `estimatedBytes` alcanza el umbral de RN-2 y `no_conviene`
   * si no (también si no es menor que el original), en los dos casos con los bytes estimados y sin motivo.
   */
  estimated(estimatedBytes: bigint, threshold: SavingsThreshold, now: Date): OptimizationJob {
    this.assertEstimating();
    const savings = new SavingsEstimate(this.data.originalBytes, estimatedBytes);
    const state = savings.isWorthIt(threshold) ? 'estimada' : 'no_conviene';
    return this.with({ state, estimatedBytes, updatedAt: now });
  }

  /** El `worker` no puede calcularla: píxeles, PNG animado o ilegible (CA-5). Final, sin bytes estimados. */
  unavailable(reason: UnavailableReason, now: Date): OptimizationJob {
    this.assertEstimating();
    return this.with({ state: 'no_disponible', reason, updatedAt: now });
  }

  /** CA-6, CA-12: el id se fija una sola vez, al confirmar, antes de encolar. */
  beginRun(resultVersionId: string, now: Date): OptimizationJob {
    if (this.state !== 'estimada' || resultVersionId.length === 0)
      throw new TypeError('Solo una estimada puede iniciar su ejecución con una versión nueva.');
    return this.with({ state: 'optimizando', resultVersionId, updatedAt: now });
  }

  complete(resultBytes: bigint, now: Date): OptimizationJob {
    this.assertRunning();
    return this.with({ state: 'completada', reason: null, resultBytes, updatedAt: now });
  }

  discard(reason: DiscardReason, now: Date, resultBytes: bigint | null = null): OptimizationJob {
    this.assertRunning();
    return this.with({ state: 'descartada', reason, resultBytes, updatedAt: now });
  }

  /**
   * Un trabajo perdido o con intentos agotados pasa a `fallida(servicio_no_disponible)` (CA-14); un candidato que
   * viola CA-8 durante la estimación, a `fallida(integridad)` (plan §6). Solo desde un estado en curso.
   */
  fail(
    now: Date,
    reason: 'servicio_no_disponible' | 'integridad' = 'servicio_no_disponible',
  ): OptimizationJob {
    if (!this.isInProgress) {
      throw new TypeError('Solo falla una optimización en curso.');
    }
    return this.with({ state: 'fallida', reason, updatedAt: now });
  }

  /** Es el resultado de una estimación de `versionId`: si la versión vigente cambió, ya no describe el archivo. */
  isEstimateOf(versionId: string): boolean {
    return ESTIMATE_RESULTS.includes(this.data.state) && this.data.sourceVersionId === versionId;
  }

  /** La estimación describe su origen; el éxito, su resultado. Otro current vuelve la ficha a «sin estimación», sin borrar nada. */
  isObsoleteFor(currentVersionId: string): boolean {
    if (this.state === 'completada') return this.resultVersionId !== currentVersionId;
    return (
      ESTIMATE_RESULTS.includes(this.data.state) && this.data.sourceVersionId !== currentVersionId
    );
  }

  snapshot(): OptimizationJobSnapshot {
    return {
      ...this.data,
      createdAt: new Date(this.data.createdAt),
      updatedAt: new Date(this.data.updatedAt),
    };
  }

  private assertEstimating(): void {
    if (this.data.state !== 'estimando') {
      throw new TypeError(
        'Solo una optimización `estimando` recibe el resultado de la estimación.',
      );
    }
  }

  private assertRunning(): void {
    if (this.state !== 'optimizando')
      throw new TypeError('Solo se resuelve una ejecución en curso.');
  }

  private with(changes: Partial<OptimizationJobSnapshot>): OptimizationJob {
    return new OptimizationJob({ ...this.data, ...changes });
  }
}
