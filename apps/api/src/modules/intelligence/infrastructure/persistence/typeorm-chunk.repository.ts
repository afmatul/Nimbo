import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  ChunkLocationJson,
  ChunkToStore,
  ChunkVersion,
  IChunkRepository,
  StoredChunk,
} from '../../application/ports/i-chunk-repository.port';

import { accessibleFiles, runNamed } from './accessible-files';
import type { NamedQuery } from './accessible-files';

/** Fragmentos por sentencia: 5000 por versión (`MAX_CHUNKS_PER_VERSION`) son 10 sentencias de pocos MB. */
const INSERT_BATCH_SIZE = 500;

const DELETE_FILE_CHUNKS_SQL = 'DELETE FROM fragmento WHERE archivo_id = $1';

/** Un lote por sentencia con `unnest`: cuatro arreglos paralelos en vez de miles de parámetros. */
const INSERT_BATCH_SQL = `
  INSERT INTO fragmento (id, archivo_id, version_archivo_id, orden, texto, procedencia, embedding, creado_en)
  SELECT gen_random_uuid(), $1, $2, f.orden, f.texto, f.procedencia, CAST(f.embedding AS vector), now()
    FROM unnest($3::integer[], $4::text[], $5::jsonb[], $6::text[]) AS f(orden, texto, procedencia, embedding)`;

const CHUNK_COLUMNS = 'f.id, f.archivo_id, f.version_archivo_id, f.orden, f.texto, f.procedencia';

interface ChunkRow {
  readonly id: string;
  readonly archivo_id: string;
  readonly version_archivo_id: string;
  readonly orden: number;
  readonly texto: string;
  readonly procedencia: ChunkLocationJson;
}

const toStoredChunk = (row: ChunkRow): StoredChunk => ({
  id: row.id,
  fileId: row.archivo_id,
  versionId: row.version_archivo_id,
  order: row.orden,
  text: row.texto,
  location: row.procedencia,
});

/** Forma de texto de pgvector: `[x,y,…]`. */
const toVectorLiteral = (vector: readonly number[]): string => `[${vector.join(',')}]`;

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
 * Los más cercanos por coseno. `MATERIALIZED` obliga a restringir a `accessibleNodes` **antes** de ordenar (DF-14):
 * el planificador no puede recorrer el índice HNSW de todas las cuentas y filtrar después. Si 020 necesita el índice
 * con filtro, lo mide y decide (`hnsw.iterative_scan`, plan §3).
 */
const nearestQuery = (actor: Actor, vector: readonly number[], limit: number): NamedQuery => {
  const access = accessibleFiles(actor, 'f.archivo_id');
  return {
    sql:
      `WITH candidatos AS MATERIALIZED (SELECT ${CHUNK_COLUMNS}, f.embedding FROM fragmento f WHERE ${access.sql}) ` +
      `SELECT ${CHUNK_COLUMNS} FROM candidatos f ` +
      'ORDER BY f.embedding <=> CAST(:queryVector AS vector), f.id LIMIT :resultLimit',
    parameters: { ...access.parameters, queryVector: toVectorLiteral(vector), resultLimit: limit },
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

  async nearest(
    actor: Actor,
    vector: readonly number[],
    limit: number,
  ): Promise<readonly StoredChunk[]> {
    const rows = await runNamed<ChunkRow>(this.manager(actor), nearestQuery(actor, vector, limit));
    return rows.map(toStoredChunk);
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
