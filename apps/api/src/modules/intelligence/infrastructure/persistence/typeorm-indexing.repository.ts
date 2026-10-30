import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IIndexingRepository } from '../../application/ports/i-indexing-repository.port';
import { FileIndexing } from '../../domain/file-indexing';
import type { IndexingState } from '../../domain/file-indexing';

import { IndexacionOrmEntity } from './indexacion.orm-entity';

/** Un evento repetido choca con `uq_indexacion_version` y no aborta la transacción. */
const INSERT_IF_ABSENT_SQL = `
  INSERT INTO indexacion (id, archivo_id, version_archivo_id, estado, motivo, intentos, fragmentos, duracion_ms,
                          creado_en, actualizado_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (version_archivo_id) DO NOTHING
  RETURNING id`;

/** Transición con comparar y asignar: solo si la fila sigue en el estado esperado. */
const COMPARE_AND_SET_SQL = `
  UPDATE indexacion
     SET estado = $2, motivo = $3, intentos = $4, fragmentos = $5, duracion_ms = $6, actualizado_en = $7
   WHERE id = $1 AND estado = $8`;

const DELETE_OTHER_VERSIONS_SQL =
  'DELETE FROM indexacion WHERE archivo_id = $1 AND version_archivo_id <> $2';

const toIndexing = (row: IndexacionOrmEntity): FileIndexing =>
  FileIndexing.rehydrate({
    id: row.id,
    fileId: row.archivoId,
    versionId: row.versionArchivoId,
    state: row.estado,
    reason: row.motivo,
    attempts: row.intentos,
    fragmentCount: row.fragmentos,
    durationMs: row.duracionMs,
    createdAt: row.creadoEn,
    updatedAt: row.actualizadoEn,
  });

/** Columnas que cambian en una transición, en el orden de `COMPARE_AND_SET_SQL`. */
const changedColumns = (indexing: FileIndexing): unknown[] => {
  const data = indexing.snapshot();
  return [
    data.state,
    data.reason,
    data.attempts,
    data.fragmentCount,
    data.durationMs,
    data.updatedAt,
  ];
};

/**
 * `IIndexingRepository` sobre Postgres (plan 019 §2). Todo método usa el `EntityManager` de
 * `requireActorScope(actor)`: la RLS de `indexacion` (solo `CLIENT` sobre archivos que ve) es la segunda barrera.
 * `@Inject` explícito: con `tsx` (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmIndexingRepository implements IIndexingRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async findByVersion(actor: Actor, versionId: string): Promise<FileIndexing | null> {
    const row = await this.manager(actor).findOne(IndexacionOrmEntity, {
      where: { versionArchivoId: versionId },
    });
    return row === null ? null : toIndexing(row);
  }

  async insertIfAbsent(actor: Actor, indexing: FileIndexing): Promise<boolean> {
    const data = indexing.snapshot();
    const inserted = (await this.manager(actor).query(INSERT_IF_ABSENT_SQL, [
      data.id,
      data.fileId,
      data.versionId,
      data.state,
      data.reason,
      data.attempts,
      data.fragmentCount,
      data.durationMs,
      data.createdAt,
      data.updatedAt,
    ])) as unknown[];
    return inserted.length > 0;
  }

  async compareAndSet(
    actor: Actor,
    indexing: FileIndexing,
    expected: IndexingState,
  ): Promise<boolean> {
    const parameters = [indexing.id, ...changedColumns(indexing), expected];
    return (await this.affected(actor, COMPARE_AND_SET_SQL, parameters)) > 0;
  }

  deleteOtherVersions(actor: Actor, current: FileIndexing): Promise<number> {
    return this.affected(actor, DELETE_OTHER_VERSIONS_SQL, [current.fileId, current.versionId]);
  }

  /** Filas que cambió un `UPDATE` o `DELETE` (en Postgres, TypeORM responde `[filas, filas afectadas]`). */
  private async affected(actor: Actor, sql: string, parameters: unknown[]): Promise<number> {
    const [, count] = (await this.manager(actor).query(sql, parameters)) as [unknown[], number];
    return count;
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
