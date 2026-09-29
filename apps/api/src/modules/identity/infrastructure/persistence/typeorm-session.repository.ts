import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type {
  ActiveSessionRecord,
  ISessionRepository,
} from '../../application/ports/i-session-repository.port';
import type { Session } from '../../domain/session.entity';

import { SesionOrmEntity } from './sesion.orm-entity';
import { toSesionRow, toSessionDomain } from './session.mapper';

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

  listActive(): Promise<readonly ActiveSessionRecord[]> {
    throw new Error('Pendiente de T-23.');
  }

  revokeIfActive(): Promise<boolean> {
    throw new Error('Pendiente de T-23.');
  }

  revokeAllExcept(): Promise<number> {
    throw new Error('Pendiente de T-23.');
  }

  private rows(): Repository<SesionOrmEntity> {
    return this.context.manager().getRepository(SesionOrmEntity);
  }
}
