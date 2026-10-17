import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  IEditSessionRepository,
  ParticipationChange,
} from '../../application/ports/i-edit-session.repository.port';
import { EditSession } from '../../domain/edit-session';
import type { EditSessionState } from '../../domain/edit-session';

import { ParticipacionOrmEntity } from './participacion.orm-entity';
import { SesionEdicionOrmEntity } from './sesion-edicion.orm-entity';

/** Estados de `uq_sesion_edicion_abierta`: a lo sumo una por archivo. */
const OPEN_STATES: readonly EditSessionState[] = ['activa', 'guardando'];

/** El `ON CONFLICT` nombra el índice parcial por su predicado: otra apertura simultánea no aborta la transacción. */
const INSERT_IF_NONE_OPEN_SQL = `
  INSERT INTO sesion_edicion (id, archivo_id, propietario_id, abierta_por, version_base_id, estado, motivo_fallo,
                              iniciada_en, finalizada_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (archivo_id) WHERE estado IN ('activa', 'guardando') DO NOTHING
  RETURNING id`;

/** Alta o regreso de un participante: conserva cuándo entró la primera vez (autoría, RN-5). */
const JOIN_SQL = `
  INSERT INTO participacion (sesion_edicion_id, usuario_id, entro_en, salio_en)
  VALUES ($1, $2, $3, NULL)
  ON CONFLICT (sesion_edicion_id, usuario_id) DO UPDATE SET salio_en = NULL`;

/** Salida de un participante conectado; si ya había salido no toca la fila (idempotente). */
const LEAVE_SQL = `
  UPDATE participacion SET salio_en = $3
  WHERE sesion_edicion_id = $1 AND usuario_id = $2 AND salio_en IS NULL`;

/** Transición con comparar y asignar: solo si la sesión sigue en el estado esperado. */
const COMPARE_AND_SET_SQL = `
  UPDATE sesion_edicion SET estado = $2, motivo_fallo = $3, finalizada_en = $4
  WHERE id = $1 AND estado = $5`;

const parametersOf = ({ sessionId, userId, now }: ParticipationChange): unknown[] => [
  sessionId,
  userId,
  now,
];

const toSession = (row: SesionEdicionOrmEntity): EditSession =>
  EditSession.rehydrate({
    id: row.id,
    fileId: row.archivoId,
    ownerId: row.propietarioId,
    openedBy: row.abiertaPor,
    baseVersionId: row.versionBaseId,
    state: row.estado,
    failureReason: row.motivoFallo,
    startedAt: row.iniciadaEn,
    endedAt: row.finalizadaEn,
  });

/**
 * `IEditSessionRepository` sobre Postgres (plan 016 §2). Todo método usa el `EntityManager` de
 * `requireActorScope(actor)`: la RLS de `sesion_edicion` y `participacion` (solo la cuenta propietaria) es la segunda
 * barrera. `@Inject` explícito: con `tsx` (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmEditSessionRepository implements IEditSessionRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async findOpenForUpdate(actor: Actor, fileId: string): Promise<EditSession | null> {
    const row = await this.manager(actor).findOne(SesionEdicionOrmEntity, {
      where: { archivoId: fileId, estado: In([...OPEN_STATES]) },
      lock: { mode: 'pessimistic_write' },
    });
    return row === null ? null : toSession(row);
  }

  async findOpen(actor: Actor, sessionId: string): Promise<EditSession | null> {
    const row = await this.manager(actor).findOne(SesionEdicionOrmEntity, {
      where: { id: sessionId, estado: In([...OPEN_STATES]) },
    });
    return row === null ? null : toSession(row);
  }

  async insertIfNoneOpen(actor: Actor, session: EditSession): Promise<boolean> {
    const data = session.snapshot();
    const inserted = (await this.manager(actor).query(INSERT_IF_NONE_OPEN_SQL, [
      data.id,
      data.fileId,
      data.ownerId,
      data.openedBy,
      data.baseVersionId,
      data.state,
      data.failureReason,
      data.startedAt,
      data.endedAt,
    ])) as unknown[];
    return inserted.length > 0;
  }

  async activeParticipants(actor: Actor, sessionId: string): Promise<readonly string[]> {
    const rows = await this.manager(actor).find(ParticipacionOrmEntity, {
      where: { sesionEdicionId: sessionId, salioEn: IsNull() },
      order: { entroEn: 'ASC' },
    });
    return rows.map((row) => row.usuarioId);
  }

  async join(actor: Actor, participation: ParticipationChange): Promise<void> {
    await this.manager(actor).query(JOIN_SQL, parametersOf(participation));
  }

  leave(actor: Actor, participation: ParticipationChange): Promise<boolean> {
    return this.updates(actor, LEAVE_SQL, parametersOf(participation));
  }

  compareAndSet(actor: Actor, session: EditSession, expected: EditSessionState): Promise<boolean> {
    const { id, state, failureReason, endedAt } = session.snapshot();
    return this.updates(actor, COMPARE_AND_SET_SQL, [id, state, failureReason, endedAt, expected]);
  }

  /** `true` si el `UPDATE` cambió alguna fila (en Postgres, TypeORM responde `[filas, filas afectadas]`). */
  private async updates(actor: Actor, sql: string, parameters: unknown[]): Promise<boolean> {
    const [, affected] = (await this.manager(actor).query(sql, parameters)) as [unknown[], number];
    return affected > 0;
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
