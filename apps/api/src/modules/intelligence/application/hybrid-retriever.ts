import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { AgentQuestion } from '../domain/agent-question';
import type { AgentScope } from '../domain/agent-scope';
import { AgentUnavailableError, EmbeddingUnavailableError } from '../domain/errors';
import type { RetrievedFragment } from '../domain/retrieved-fragment';
import { fuse } from '../domain/rrf-fuse';
import { sourceLocationFromJson } from '../domain/source-location-json';

import { I_CHUNK_SEARCH } from './ports/i-chunk-search.port';
import type { IChunkSearch, ScoredChunk, SearchedChunk } from './ports/i-chunk-search.port';
import { I_EMBEDDING_PROVIDER } from './ports/i-embedding-provider.port';
import type { Embedding, IEmbeddingProvider } from './ports/i-embedding-provider.port';

/** Fragmentos que llegan al modelo tras la fusión (plan 020 §2, fila 4). Se calibra en T-09. */
export const TOP_K = 8;

/** Candidatos que aporta cada búsqueda antes de fusionar: margen sobre `TOP_K` para que RRF tenga de dónde elegir. */
export const CANDIDATES_PER_SEARCH = 20;

/**
 * Similitud coseno mínima de un candidato vectorial (CA-3). Calibrada en T-10 con el embedding real (plan §6): punto
 * medio entre la peor pregunta con respuesta (0.676) y la mejor sin respuesta (0.645). Corpus de 12 fragmentos: revisar con datos reales.
 */
export const MIN_SIMILARITY = 0.66;

/** Qué se pregunta y dónde (RN-9). */
export interface RetrievalRequest {
  readonly question: AgentQuestion;
  readonly scope: AgentScope;
}

/** Fragmentos para el prompt y cuántos se descartaron por procedencia inválida (para la bitácora, plan §5). */
export interface Retrieval {
  readonly fragments: readonly RetrievedFragment[];
  readonly discarded: number;
}

/** Fragmento con su ubicación rehidratada, o `undefined` si la procedencia guardada no es válida (D-5). */
function toFragment(chunk: SearchedChunk): RetrievedFragment | undefined {
  const location = sourceLocationFromJson(chunk.location);
  if (location === undefined) return undefined;
  return {
    id: chunk.id,
    fileId: chunk.fileId,
    versionId: chunk.versionId,
    fileName: chunk.fileName,
    text: chunk.text,
    location,
  };
}

/** Rehidrata cada lista; un fragmento inválido sale de todas y se cuenta una vez aunque esté en las dos. */
function rehydrate(rankings: readonly (readonly SearchedChunk[])[]): {
  rankings: RetrievedFragment[][];
  discarded: number;
} {
  const invalid = new Set<string>();
  const valid = rankings.map((ranking) =>
    ranking.flatMap((chunk) => {
      const fragment = toFragment(chunk);
      if (fragment === undefined) invalid.add(chunk.id);
      return fragment === undefined ? [] : [fragment];
    }),
  );
  return { rankings: valid, discarded: invalid.size };
}

/**
 * Recuperación híbrida del agente (plan 020 D-2): vectoriza la pregunta (`task: 'query'`, fuera de la transacción: es
 * red), corre la búsqueda léxica y la vectorial en un `withActor` (cada una filtra por `accessibleNodes`, versión
 * vigente y ámbito en su propia consulta), quita los vectoriales por debajo de `MIN_SIMILARITY`, fusiona por RRF y
 * corta en `TOP_K`. La léxica no lleva umbral: comparte lexemas con la pregunta. Sin fragmentos, quien compone responde
 * la frase fija (CA-3).
 */
@Injectable()
export class HybridRetriever {
  constructor(
    @Inject(I_EMBEDDING_PROVIDER) private readonly embeddings: IEmbeddingProvider,
    @Inject(I_CHUNK_SEARCH) private readonly search: IChunkSearch,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
  ) {}

  async retrieve(actor: Actor, request: RetrievalRequest): Promise<Retrieval> {
    const vector = await this.embedQuestion(request.question);
    const [lexical, semantic] = await this.transactions.withActor(actor, () =>
      this.searchBoth(actor, request, vector),
    );
    const close = semantic.filter((chunk) => chunk.similarity >= MIN_SIMILARITY);
    const { rankings, discarded } = rehydrate([lexical, close]);
    return { fragments: fuse(rankings).slice(0, TOP_K), discarded };
  }

  /** El proveedor caído o sin clave es el agente no disponible (CA-15); lo demás se propaga tal cual. */
  private async embedQuestion(question: AgentQuestion): Promise<Embedding> {
    try {
      const [vector] = await this.embeddings.embed([question.text], 'query');
      if (vector === undefined) throw new AgentUnavailableError();
      return vector;
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw new AgentUnavailableError();
      throw error;
    }
  }

  /** En serie: comparten el `EntityManager` (una conexión) de la transacción del actor. */
  private async searchBoth(
    actor: Actor,
    request: RetrievalRequest,
    vector: Embedding,
  ): Promise<[readonly SearchedChunk[], readonly ScoredChunk[]]> {
    const { question, scope } = request;
    const limit = CANDIDATES_PER_SEARCH;
    const lexical = await this.search.keywordSearch(actor, { text: question.text, scope, limit });
    const semantic = await this.search.vectorSearch(actor, { vector, scope, limit });
    return [lexical, semantic];
  }
}
