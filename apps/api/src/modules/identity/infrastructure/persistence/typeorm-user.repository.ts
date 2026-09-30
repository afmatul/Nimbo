import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { IUserRepository } from '../../application/ports/i-user-repository.port';
import type { ClientUser } from '../../domain/client-user.entity';
import type { EmailAddress } from '../../domain/email-address.vo';
import type { PasswordHash } from '../../domain/password-hash.vo';
import type { User } from '../../domain/user.entity';

import { toUserDomain, toUsuarioRow } from './user.mapper';
import { UsuarioOrmEntity } from './usuario.orm-entity';

/**
 * Sin `23505`: tras un error Postgres aborta la transacción y ya no se podría releer la cuenta en ella (plan §6.4).
 * `ON CONFLICT (correo)` solo cubre el correo; un choque de `id` sí sube como error no controlado.
 */
const INSERT_IF_ABSENT_SQL = `
  INSERT INTO usuario (id, nombre, correo, hash_clave, rol, estado, correo_verificado, version_terminos,
    version_privacidad, terminos_aceptados_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (correo) DO NOTHING
  RETURNING id`;

/**
 * `IUserRepository` sobre `usuario` (plan §6.4). Usa el `EntityManager` de `TransactionContext`: el de la
 * transacción de `ITransactionRunner.run` o, fuera de ella, el del `DataSource`. Los `…ForUpdate` exigen transacción.
 */
@Injectable()
export class TypeormUserRepository implements IUserRepository {
  constructor(private readonly context: TransactionContext) {}

  async findByEmail(email: EmailAddress): Promise<User | null> {
    const row = await this.rows().findOneBy({ correo: email.value });
    return row === null ? null : toUserDomain(row);
  }

  async findByEmailForUpdate(email: EmailAddress): Promise<User | null> {
    const row = await this.rows().findOne({
      where: { correo: email.value },
      lock: { mode: 'pessimistic_write' },
    });
    return row === null ? null : toUserDomain(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.rows().findOneBy({ id });
    return row === null ? null : toUserDomain(row);
  }

  async findByIdForUpdate(id: string): Promise<User | null> {
    const row = await this.rows().findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    return row === null ? null : toUserDomain(row);
  }

  async insertIfAbsent(user: ClientUser): Promise<boolean> {
    const row = toUsuarioRow(user);
    const inserted = (await this.context
      .manager()
      .query(INSERT_IF_ABSENT_SQL, [
        row.id,
        row.nombre,
        row.correo,
        row.hashClave,
        row.rol,
        row.estado,
        row.correoVerificado,
        row.versionTerminos,
        row.versionPrivacidad,
        row.terminosAceptadosEn,
      ])) as unknown[];
    return inserted.length > 0;
  }

  async update(user: ClientUser): Promise<void> {
    const {
      nombre,
      hashClave,
      correoVerificado,
      versionTerminos,
      versionPrivacidad,
      terminosAceptadosEn,
    } = toUsuarioRow(user);
    await this.rows().update(
      { id: user.id },
      {
        nombre,
        hashClave,
        correoVerificado,
        versionTerminos,
        versionPrivacidad,
        terminosAceptadosEn,
      },
    );
  }

  async updatePasswordHash(id: string, passwordHash: PasswordHash): Promise<void> {
    await this.rows().update({ id }, { hashClave: passwordHash.reveal() });
  }

  private rows(): Repository<UsuarioOrmEntity> {
    return this.context.manager().getRepository(UsuarioOrmEntity);
  }
}
