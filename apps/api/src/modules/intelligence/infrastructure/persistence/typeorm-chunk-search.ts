import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  IChunkSearch,
  KeywordQuery,
  ScoredChunk,
  SearchedChunk,
  VectorQuery,
} from '../../application/ports/i-chunk-search.port';
import type { AgentScope } from '../../domain/agent-scope';

import { runNamed } from './accessible-files';
import type { NamedQuery } from './accessible-files';
import { toStoredChunk } from './chunk-rows';
import type { ChunkRow } from './chunk-rows';
import {
  hasIndexedQuery,
  keywordSearchQuery,
  scopeExistsQuery,
  vectorSearchQuery,
} from './chunk-sql';

/** Fila de una búsqueda: el fragmento y el nombre de su archivo (`SEARCH_COLUMNS` de `chunk-sql.ts`). */
interface SearchedChunkRow extends ChunkRow {
  readonly archivo_nombre: string;
}

interface ScoredChunkRow extends SearchedChunkRow {
  readonly similitud: number;
}

const toSearchedChunk = (row: SearchedChunkRow): SearchedChunk => ({
  ...toStoredChunk(row),
  fileName: row.archivo_nombre,
});

/**
 * `IChunkSearch` sobre Postgres y pgvector (plan 020 D-2). El SQL vive en `chunk-sql.ts` (ADR-0035); aquí solo se
 * ejecuta con el `EntityManager` de `requireActorScope(actor)` y se mapean las filas. `@Inject` explícito: con `tsx`
 * (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmChunkSearch implements IChunkSearch {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async keywordSearch(actor: Actor, query: KeywordQuery): Promise<readonly SearchedChunk[]> {
    const rows = await this.run<SearchedChunkRow>(actor, keywordSearchQuery(actor, query));
    return rows.map(toSearchedChunk);
  }

  async vectorSearch(actor: Actor, query: VectorQuery): Promise<readonly ScoredChunk[]> {
    const rows = await this.run<ScoredChunkRow>(actor, vectorSearchQuery(actor, query));
    return rows.map((row) => ({ ...toSearchedChunk(row), similarity: Number(row.similitud) }));
  }

  hasIndexed(actor: Actor): Promise<boolean> {
    return this.exists(actor, hasIndexedQuery(actor));
  }

  scopeExists(actor: Actor, scope: AgentScope): Promise<boolean> {
    if (scope.type === 'all') return Promise.resolve(true);
    return this.exists(actor, scopeExistsQuery(actor, scope));
  }

  private async exists(actor: Actor, query: NamedQuery): Promise<boolean> {
    const [row] = await this.run<{ existe: boolean }>(actor, query);
    return row?.existe === true;
  }

  private run<T>(actor: Actor, query: NamedQuery): Promise<T[]> {
    return runNamed<T>(this.manager(actor), query);
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
