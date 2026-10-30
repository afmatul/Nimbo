/** Dimensión de todo vector de `intelligence` (`fragmento.embedding vector(768)`, plan 019 §3, RN-9). */
export const EMBEDDING_DIMENSIONS = 768;

/** Vector de `EMBEDDING_DIMENSIONS` números con norma L2 = 1 (la similitud coseno de pgvector lo supone). */
export type Embedding = readonly number[];

/**
 * Para qué se vectoriza (020 D-8): `document` para los fragmentos que se guardan (el `worker`, por omisión) y `query`
 * para la pregunta del agente que los busca. El proveedor puede optimizar cada lado; el vector tiene la misma forma.
 */
export type EmbeddingTask = 'query' | 'document';

/**
 * Vectoriza texto para la búsqueda semántica (diagrama M6, ADR-0007; reglas (a) y (c) de Art. V.2). Devuelve un vector
 * por texto, en el mismo orden; reparte en lotes del proveedor por dentro, y una lista vacía no llama a nadie. Si el
 * proveedor no responde o no está configurado lanza `EmbeddingUnavailableError` (reintentable o no, CA-12). Nunca
 * registra el texto ni la clave.
 */
export interface IEmbeddingProvider {
  embed(texts: readonly string[], task?: EmbeddingTask): Promise<readonly Embedding[]>;
}

export const I_EMBEDDING_PROVIDER = Symbol('IEmbeddingProvider');
