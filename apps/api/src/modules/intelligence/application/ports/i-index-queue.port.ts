/**
 * Trabajo `indexing` (plan 019 §4): la versión que se indexa y la cuenta propietaria con que actúa el `worker`. Sin
 * texto, nombre, URL ni clave de objeto. El `worker` no confía en `ownerId`: RLS y `ownedFiles` deciden (CA-16).
 */
export interface IndexJob {
  readonly fileId: string;
  readonly versionId: string;
  readonly ownerId: string;
}

/**
 * Cola `indexing` (plan 019 §2, regla (a) de Art. V.2: BullMQ). **Interna** de `intelligence`: la llenan el evento
 * `storage.file-version-created`, «Reintentar» y la conciliación; ya no la cruza `editing` (cierra PD-18).
 */
export interface IIndexQueue {
  /** Un trabajo por versión: encolar la misma versión dos veces mientras su trabajo existe no agrega otro (CA-9). */
  enqueue(job: IndexJob): Promise<void>;
  /**
   * «Reintentar» (CA-13): un trabajo propio de la transición `fallido → pendiente` hecha en `retriedAt`, que no absorbe
   * el trabajo que dejó `fallido` y todavía no terminó. El CAS de esa transición gana una sola vez por fallo.
   */
  enqueueRetry(job: IndexJob, retriedAt: Date): Promise<void>;
}

export const I_INDEX_QUEUE = Symbol('IIndexQueue');
