/**
 * Trabajo de la cola `optimization` (plan 021 §2): la optimización, su archivo y la cuenta con que actúa el `worker`.
 * Sin nombre, clave de objeto ni URL. El `worker` no confía en `ownerId`: la RLS y la fachada deciden (plan §5).
 */
export interface OptimizationTask {
  readonly optimizationId: string;
  readonly fileId: string;
  readonly ownerId: string;
}

/**
 * Cola `optimization` (`IJobQueue` del diagrama; regla (a) de Art. V.2: BullMQ). BullMQ solo ejecuta: el estado de
 * negocio vive en `optimizacion`.
 */
export interface IJobQueue {
  /** Un trabajo por optimización: encolar la misma dos veces mientras su trabajo existe no agrega otro. */
  enqueueEstimate(task: OptimizationTask): Promise<void>;
  enqueueRun(task: OptimizationTask): Promise<void>;
}

export const I_JOB_QUEUE = Symbol('IJobQueue');
