/** Dimensión de todo vector de `intelligence` (`fragmento.embedding vector(768)`, plan 019 §3, RN-9). */
export const EMBEDDING_DIMENSIONS = 768;

/** Vector de `EMBEDDING_DIMENSIONS` números con norma L2 = 1 (la similitud coseno de pgvector lo supone). */
export type Embedding = readonly number[];

/**
 * Vectoriza texto para la búsqueda semántica (diagrama M6, ADR-0007; reglas (a) y (c) de Art. V.2). Devuelve un vector
 * por texto, en el mismo orden; reparte en lotes del proveedor por dentro, y una lista vacía no llama a nadie. Si el
 * proveedor no responde o no está configurado lanza `EmbeddingUnavailableError` (reintentable o no, CA-12). Nunca
 * registra el texto ni la clave.
 */
export interface IEmbeddingProvider {
  embed(texts: readonly string[]): Promise<readonly Embedding[]>;
}

export const I_EMBEDDING_PROVIDER = Symbol('IEmbeddingProvider');
