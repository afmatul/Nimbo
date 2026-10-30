import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  ChunkToStore,
  ChunkVersion,
  IChunkRepository,
  StoredChunk,
} from '../../application/ports/i-chunk-repository.port';

import { accessibleFiles, runNamed } from './accessible-files';
import type { NamedQuery } from './accessible-files';
import { CHUNK_COLUMNS, toStoredChunk, toVectorLiteral } from './chunk-rows';
import type { ChunkRow } from './chunk-rows';

/** Fragmentos por sentencia: 5000 por versión (`MAX_CHUNKS_PER_VERSION`) son 10 sentencias de pocos MB. */
const INSERT_BATCH_SIZE = 500;

const DELETE_FILE_CHUNKS_SQL = 'DELETE FROM fragmento WHERE archivo_id = $1';

/** Un lote por sentencia con `unnest`: cuatro arreglos paralelos en vez de miles de parámetros. */
const INSERT_BATCH_SQL = `
  INSERT INTO fragmento (id, archivo_id, version_archivo_id, orden, texto, procedencia, embedding, creado_en)
  SELECT gen_random_uuid(), $1, $2, f.orden, f.texto, f.procedencia, CAST(f.embedding AS vector), now()
    FROM unnest($3::integer[], $4::text[], $5::jsonb[], $6::text[]) AS f(orden, texto, procedencia, embedding)`;

const batchesOf = (chunks: readonly ChunkToStore[]): ChunkToStore[][] =>
  Array.from({ length: Math.ceil(chunks.length / INSERT_BATCH_SIZE) }, (_value, index) =>
    chunks.slice(index * INSERT_BATCH_SIZE, (index + 1) * INSERT_BATCH_SIZE),
  );

/** Fragmentos de un archivo que el actor ve vivo, por orden. */
const byFileQuery = (actor: Actor, fileId: string): NamedQuery => {
  const access = accessibleFiles(actor, 'f.archivo_id');
  return {
    sql: `SELECT ${CHUNK_COLUMNS} FROM fragmento f WHERE f.archivo_id = :fileId AND ${access.sql} ORDER BY f.orden`,
    parameters: { ...access.parameters, fileId },
  };
};

/**
 * `IChunkRepository` sobre Postgres y pgvector (plan 019 §2). Todo método usa el `EntityManager` de
 * `requireActorScope(actor)`; las lecturas llevan `accessibleNodes(actor)` dentro de la consulta y la RLS de
 * `fragmento` es la segunda barrera. `@Inject` explícito: con `tsx` (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmChunkRepository implements IChunkRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async replaceForVersion(
    actor: Actor,
    version: ChunkVersion,
    chunks: readonly ChunkToStore[],
  ): Promise<void> {
    const manager = this.manager(actor);
    await manager.query(DELETE_FILE_CHUNKS_SQL, [version.fileId]);
    for (const batch of batchesOf(chunks)) {
      await manager.query(INSERT_BATCH_SQL, [
        version.fileId,
        version.versionId,
        batch.map((chunk) => chunk.order),
        batch.map((chunk) => chunk.text),
        batch.map((chunk) => JSON.stringify(chunk.location)),
        batch.map((chunk) => toVectorLiteral(chunk.embedding)),
      ]);
    }
  }

  async findByFile(actor: Actor, fileId: string): Promise<readonly StoredChunk[]> {
    const rows = await runNamed<ChunkRow>(this.manager(actor), byFileQuery(actor, fileId));
    return rows.map(toStoredChunk);
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
