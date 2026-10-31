import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IJobRepository } from '../../application/ports/i-job.repository.port';
import { OptimizationJob } from '../../domain/optimization-job';
import type { OptimizationState } from '../../domain/optimization-job';

import { OptimizacionOrmEntity } from './optimizacion.orm-entity';

const IN_PROGRESS: OptimizationState[] = ['estimando', 'optimizando'];

/** Otro pedido en curso del mismo archivo choca con `uq_optimizacion_en_curso` y no aborta la transacción. */
const INSERT_IF_NONE_IN_PROGRESS_SQL = `
  INSERT INTO optimizacion (id, archivo_id, version_origen_id, version_resultado_id, estado, motivo, bytes_origen,
                            bytes_estimados, bytes_resultado, creado_en, actualizado_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  ON CONFLICT (archivo_id) WHERE estado IN ('estimando', 'optimizando') DO NOTHING
  RETURNING id`;

/**
 * Transición con comparar y asignar: solo si la fila sigue en el estado y con el `actualizado_en` leídos. Postgres
 * guarda microsegundos y el dominio milisegundos, así que se compara truncado.
 */
const COMPARE_AND_SET_SQL = `
  UPDATE optimizacion
     SET version_resultado_id = $2, estado = $3, motivo = $4, bytes_estimados = $5, bytes_resultado = $6,
         actualizado_en = $7
   WHERE id = $1 AND estado = $8 AND date_trunc('milliseconds', actualizado_en) = $9
     AND (version_resultado_id IS NULL OR version_resultado_id = $2)
     AND ($8 <> 'estimada' OR id = (
       SELECT latest.id FROM optimizacion latest WHERE latest.archivo_id = optimizacion.archivo_id
        ORDER BY latest.creado_en DESC, latest.id DESC LIMIT 1))`;

const bigintOrNull = (value: bigint | null): string | null => value?.toString() ?? null;

const toJob = (row: OptimizacionOrmEntity): OptimizationJob =>
  OptimizationJob.rehydrate({
    id: row.id,
    fileId: row.archivoId,
    sourceVersionId: row.versionOrigenId,
    resultVersionId: row.versionResultadoId,
    state: row.estado,
    reason: row.motivo,
    originalBytes: row.bytesOrigen,
    estimatedBytes: row.bytesEstimados,
    resultBytes: row.bytesResultado,
    createdAt: row.creadoEn,
    updatedAt: row.actualizadoEn,
  });

/**
 * `IJobRepository` sobre Postgres (plan 021 §2 y §3). Todo método usa el `EntityManager` de `requireActorScope(actor)`:
 * la RLS de `optimizacion` (solo el dueño del archivo) es la segunda barrera. `@Inject` explícito: con `tsx`
 * (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmJobRepository implements IJobRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async findById(actor: Actor, id: string): Promise<OptimizationJob | null> {
    const row = await this.manager(actor).findOne(OptimizacionOrmEntity, { where: { id } });
    return row === null ? null : toJob(row);
  }

  async latestOf(actor: Actor, fileId: string): Promise<OptimizationJob | null> {
    const row = await this.manager(actor).findOne(OptimizacionOrmEntity, {
      where: { archivoId: fileId },
      order: { creadoEn: 'DESC', id: 'DESC' },
    });
    return row === null ? null : toJob(row);
  }

  async findInProgress(actor: Actor, fileId: string): Promise<OptimizationJob | null> {
    const row = await this.manager(actor).findOne(OptimizacionOrmEntity, {
      where: { archivoId: fileId, estado: In(IN_PROGRESS) },
    });
    return row === null ? null : toJob(row);
  }

  async insertIfNoneInProgress(actor: Actor, job: OptimizationJob): Promise<boolean> {
    const data = job.snapshot();
    const inserted = (await this.manager(actor).query(INSERT_IF_NONE_IN_PROGRESS_SQL, [
      data.id,
      data.fileId,
      data.sourceVersionId,
      data.resultVersionId,
      data.state,
      data.reason,
      data.originalBytes.toString(),
      bigintOrNull(data.estimatedBytes),
      bigintOrNull(data.resultBytes),
      data.createdAt,
      data.updatedAt,
    ])) as unknown[];
    return inserted.length > 0;
  }

  async compareAndSet(
    actor: Actor,
    next: OptimizationJob,
    previous: OptimizationJob,
  ): Promise<boolean> {
    const data = next.snapshot();
    const expected = previous.snapshot();
    const [, count] = (await this.manager(actor).query(COMPARE_AND_SET_SQL, [
      data.id,
      data.resultVersionId,
      data.state,
      data.reason,
      bigintOrNull(data.estimatedBytes),
      bigintOrNull(data.resultBytes),
      data.updatedAt,
      expected.state,
      expected.updatedAt,
    ])) as [unknown[], number];
    return count > 0;
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
