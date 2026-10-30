import type {
  IChunkSearch,
  ScoredChunk,
  SearchedChunk,
  VectorQuery,
} from '../../src/modules/intelligence/application/ports/i-chunk-search.port';
import type { Embedding } from '../../src/modules/intelligence/application/ports/i-embedding-provider.port';
import type { Actor } from '../../src/shared';

import type { MeasuredChunk } from './agent-measure-corpus';

/** Coseno de dos vectores de norma 1 (los normaliza el proveedor): su producto punto. */
const cosine = (left: Embedding, right: Embedding): number =>
  left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);

/**
 * `IChunkSearch` en memoria para `agent:measure` (020 T-09): el corpus de medición es de una sola cuenta, así que no
 * hay ámbito ni aislamiento que filtrar. La vectorial es el mismo barrido exacto por coseno que el SQL; la léxica no
 * devuelve nada (el `tsvector` es de PostgreSQL) y la latencia del SQL la confirma T-10 de punta a punta. Anota la
 * mejor similitud de cada búsqueda para calibrar `MIN_SIMILARITY` (CA-3).
 */
export class MemoryChunkSearch implements IChunkSearch {
  readonly bestSimilarities: number[] = [];

  constructor(private readonly corpus: readonly MeasuredChunk[]) {}

  keywordSearch(): Promise<readonly SearchedChunk[]> {
    return Promise.resolve([]);
  }

  vectorSearch(_actor: Actor, query: VectorQuery): Promise<readonly ScoredChunk[]> {
    const ranked = this.corpus
      .map(({ chunk, vector }) => ({ ...chunk, similarity: cosine(query.vector, vector) }))
      .sort((left, right) => right.similarity - left.similarity);
    this.bestSimilarities.push(ranked[0]?.similarity ?? 0);
    return Promise.resolve(ranked.slice(0, query.limit));
  }

  hasIndexed(): Promise<boolean> {
    return Promise.resolve(this.corpus.length > 0);
  }

  scopeExists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
