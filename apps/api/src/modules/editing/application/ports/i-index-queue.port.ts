/** Lo que se reindexa: la versión nueva de un archivo (RF-30). */
export interface IndexRequest {
  readonly fileId: string;
  readonly versionId: string;
}

/**
 * Cola `indexing` (`architecture.md` §5 y §7.3, CA-12): `editing` encola la versión editada para que M6 la reindexe.
 * Hasta 019 no hay consumidor, y eso no hace fallar el guardado. Quién declara el puerto entre módulos lo decide 019
 * (PD-18); mientras tanto vive en `editing`, su único productor.
 */
export interface IIndexQueue {
  enqueue(request: IndexRequest): Promise<void>;
}

export const I_INDEX_QUEUE = Symbol('IIndexQueue');
