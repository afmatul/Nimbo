import { Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import type { Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type {
  ActiveSessionRecord,
  ISessionRepository,
} from '../../application/ports/i-session-repository.port';
import type { Session } from '../../domain/session.entity';

import { SesionOrmEntity } from './sesion.orm-entity';
import { toSesionRow, toSessionDomain } from './session.mapper';

type ActiveSessionRow = SesionOrmEntity & { readonly agenteUsuario: string };

/**
 * Sesiones vigentes con el agente de usuario de su dispositivo (`JOIN` por la FK compuesta). No selecciona
 * `huella_hash` ni `ultima_ip`; los hashes de refresco vienen solo porque `Session` los exige.
 */
const LIST_ACTIVE_SQL = `
  SELECT s.id,
         s.usuario_id            AS "usuarioId",
         s.dispositivo_id        AS "dispositivoId",
         s.refresh_hash          AS "refreshHash",
         s.refresh_anterior_hash AS "refreshAnteriorHash",
         s.rotado_en             AS "rotadoEn",
         s.creada_en             AS "creadaEn",
         s.ultimo_uso            AS "ultimoUso",
         s.expira_en             AS "expiraEn",
         s.revocada_en           AS "revocadaEn",
         d.agente_usuario        AS "agenteUsuario"
    FROM sesion s
    JOIN dispositivo d ON d.id = s.dispositivo_id AND d.usuario_id = s.usuario_id
   WHERE s.usuario_id = $1
     AND s.revocada_en IS NULL
     AND s.expira_en > $2
     AND s.ultimo_uso > $3
   ORDER BY s.ultimo_uso DESC
   LIMIT $4`;

/**
 * `ISessionRepository` sobre `sesion` (plan §4, §6.4), con el `EntityManager` de `TransactionContext`. Toda consulta
 * que recibe `userId` lo pone en el `WHERE` (Art. IX.2).
 */
@Injectable()
export class TypeOrmSessionRepository implements ISessionRepository {
  constructor(private readonly context: TransactionContext) {}

  async insert(session: Session): Promise<void> {
    await this.rows().insert(toSesionRow(session));
  }

  /** Lectura por clave primaria con `FOR UPDATE` (DT-1): serializa dos renovaciones. Exige una transacción. */
  async findByIdForUpdate(id: string): Promise<Session | null> {
    const row = await this.rows()
      .createQueryBuilder('sesion')
      .setLock('pessimistic_write')
      .where('sesion.id = :id', { id })
      .getOne();
    return row === null ? null : toSessionDomain(row);
  }

  /** Solo cambia lo que cambia en una sesión: hashes, rotación, último uso y revocación. */
  async update(session: Session): Promise<void> {
    const row = toSesionRow(session);
    await this.rows().update(
      { id: row.id, usuarioId: row.usuarioId },
      {
        refreshHash: row.refreshHash,
        refreshAnteriorHash: row.refreshAnteriorHash,
        rotadoEn: row.rotadoEn,
        ultimoUso: row.ultimoUso,
        revocadaEn: row.revocadaEn,
      },
    );
  }

  /** Vigentes (plan §4): sin revocar, antes de `expira_en` y usadas después de `idleCutoff`. */
  async listActive(
    userId: string,
    now: Date,
    idleCutoff: Date,
    limit: number,
  ): Promise<readonly ActiveSessionRecord[]> {
    const rows = (await this.context
      .manager()
      .query(LIST_ACTIVE_SQL, [userId, now, idleCutoff, limit])) as ActiveSessionRow[];
    return rows.map(({ agenteUsuario, ...row }) => ({
      session: toSessionDomain(row),
      agenteUsuario,
    }));
  }

  /** Un solo `UPDATE` con el dueño en el `WHERE`: una sesión ajena o ya revocada no cambia (CA-12). */
  async revokeIfActive(id: string, userId: string, now: Date): Promise<boolean> {
    const result = await this.rows().update(
      { id, usuarioId: userId, revocadaEn: IsNull() },
      { revocadaEn: now },
    );
    return result.affected === 1;
  }

  async revokeAllExcept(userId: string, exceptId: string | null, now: Date): Promise<number> {
    const result = await this.rows().update(
      {
        usuarioId: userId,
        revocadaEn: IsNull(),
        ...(exceptId === null ? {} : { id: Not(exceptId) }),
      },
      { revocadaEn: now },
    );
    return result.affected ?? 0;
  }

  private rows(): Repository<SesionOrmEntity> {
    return this.context.manager().getRepository(SesionOrmEntity);
  }
}
