import type { Actor } from '../../../../shared';
import type { AgentScope } from '../../domain/agent-scope';

import type { StoredChunk } from './i-chunk-repository.port';
import type { Embedding } from './i-embedding-provider.port';

/** Búsqueda léxica: el texto de la pregunta, el ámbito y cuántos fragmentos devolver como mucho. */
export interface KeywordQuery {
  readonly text: string;
  readonly scope: AgentScope;
  readonly limit: number;
}

/** Búsqueda vectorial: el vector de la pregunta (`task: 'query'`), el ámbito y el tope. */
export interface VectorQuery {
  readonly vector: Embedding;
  readonly scope: AgentScope;
  readonly limit: number;
}

/**
 * Fragmento encontrado para el agente con el nombre de su archivo (`archivo.nombre`, leído en la misma consulta;
 * enmienda de ADR-0036). El nombre es para la cita del dueño (S-1): nunca va al modelo ni a bitácoras.
 */
export interface SearchedChunk extends StoredChunk {
  readonly fileName: string;
}

/** Fragmento de la búsqueda vectorial con su similitud coseno con la pregunta (1 = idéntico). */
export interface ScoredChunk extends SearchedChunk {
  readonly similarity: number;
}

/**
 * Lectura de fragmentos para el agente (plan 020 D-2; regla (b) de Art. V.2). Solo lectura: la escritura es de
 * `IChunkRepository` (`worker`). Todo método toma el `EntityManager` de `requireActorScope(actor)` y restringe, **en la
 * misma consulta**, a los archivos que el actor ve vivos (`accessibleNodes`), a su versión vigente (RN-2) y al ámbito
 * (RN-9); la RLS es la segunda barrera. Los roles internos no reciben nada.
 */
export interface IChunkSearch {
  /** Fragmentos con algún lexema de la pregunta, de mayor a menor `ts_rank_cd`. */
  keywordSearch(actor: Actor, query: KeywordQuery): Promise<readonly SearchedChunk[]>;
  /** Los más cercanos por coseno (barrido exacto sobre lo filtrado, sin HNSW). */
  vectorSearch(actor: Actor, query: VectorQuery): Promise<readonly ScoredChunk[]>;
  /** Hay al menos un archivo accesible con su versión vigente `indexado` (CA-7). */
  hasIndexed(actor: Actor): Promise<boolean>;
  /** El ámbito existe y el actor lo ve vivo; uno ajeno responde igual que uno inexistente (CA-17). */
  scopeExists(actor: Actor, scope: AgentScope): Promise<boolean>;
}

export const I_CHUNK_SEARCH = Symbol('IChunkSearch');
