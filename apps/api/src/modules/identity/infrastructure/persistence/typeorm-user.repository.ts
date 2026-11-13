import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { Role, TransactionContext } from '../../../../shared';
import type { PasswordHash } from '../../../../shared';
import type { IAdminRosterRepository } from '../../application/ports/i-admin-roster.repository.port';
import type { IUserRepository } from '../../application/ports/i-user-repository.port';
import { AccountStatus } from '../../domain/account-status.enum';
import type { ClientUser } from '../../domain/client-user.entity';
import type { EmailAddress } from '../../domain/email-address.vo';
import type { EmployeeCode } from '../../domain/employee-code.vo';
import { InternalUser } from '../../domain/internal-user.entity';
import type { User } from '../../domain/user.entity';

import { toInternalUsuarioRow, toUserDomain, toUsuarioRow } from './user.mapper';
import type { UsuarioRow } from './user.mapper';
import { UsuarioOrmEntity } from './usuario.orm-entity';

/**
 * Sin `23505`: tras un error Postgres aborta la transacción y ya no se podría releer la cuenta en ella (plan §6.4).
 * `ON CONFLICT (correo)` solo cubre el correo; un choque de `id` sí sube como error no controlado.
 */
const INSERT_COLUMNS = `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, estado, correo_verificado,
    version_terminos, version_privacidad, terminos_aceptados_en, codigo_empleado, plan_pendiente_slug)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
const INSERT_IF_ABSENT_SQL = `${INSERT_COLUMNS} ON CONFLICT (correo) DO NOTHING RETURNING id`;
/** Sin destino: cubre `uq_usuario_correo` y `uq_usuario_codigo_empleado` (011 CA-6). */
const INSERT_INTERNAL_IF_ABSENT_SQL = `${INSERT_COLUMNS} ON CONFLICT DO NOTHING RETURNING id`;
/** Clave del candado del padrón de Administradores (011 RN-7): la misma en toda la aplicación. */
const LOCK_ADMIN_ROSTER_SQL = "SELECT pg_advisory_xact_lock(hashtext('identity.admin_roster'))";

const insertParameters = (row: UsuarioRow): unknown[] => [
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
  row.codigoEmpleado,
  row.planPendienteSlug,
];

/**
 * `IUserRepository` e `IAdminRosterRepository` (011) sobre `usuario` (plan §6.4). Usa el `EntityManager` de
 * `TransactionContext`: el de la transacción de `ITransactionRunner.run` o, fuera de ella, el del `DataSource`. Los
 * `…ForUpdate` exigen transacción.
 */
@Injectable()
export class TypeormUserRepository implements IUserRepository, IAdminRosterRepository {
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

  insertIfAbsent(user: ClientUser): Promise<boolean> {
    return this.insertRow(INSERT_IF_ABSENT_SQL, toUsuarioRow(user));
  }

  insertInternalIfAbsent(user: InternalUser): Promise<boolean> {
    return this.insertRow(INSERT_INTERNAL_IF_ABSENT_SQL, toInternalUsuarioRow(user));
  }

  async findByEmployeeCode(code: EmployeeCode): Promise<InternalUser | null> {
    const row = await this.rows().findOneBy({ codigoEmpleado: code.value });
    const user = row === null ? null : toUserDomain(row);
    return user instanceof InternalUser ? user : null;
  }

  async updateStatus(id: string, status: AccountStatus): Promise<void> {
    await this.rows().update({ id }, { estado: status });
  }

  async statusOf(id: string): Promise<AccountStatus | null> {
    const row = await this.rows().findOne({ select: { estado: true }, where: { id } });
    return row?.estado ?? null;
  }

  countActiveAdmins(): Promise<number> {
    return this.rows().countBy({ rol: Role.ADMIN, estado: AccountStatus.ACTIVE });
  }

  async lockAdminRoster(): Promise<void> {
    if (this.context.current() === undefined) {
      throw new Error(
        'El candado del padrón de Administradores exige una transacción (`ITransactionRunner.run`).',
      );
    }
    await this.context.manager().query(LOCK_ADMIN_ROSTER_SQL);
  }

  async update(user: ClientUser): Promise<void> {
    const {
      nombre,
      hashClave,
      correoVerificado,
      versionTerminos,
      versionPrivacidad,
      terminosAceptadosEn,
      planPendienteSlug,
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
        planPendienteSlug,
      },
    );
  }

  async clearPendingPlan(id: string): Promise<void> {
    await this.rows().update({ id }, { planPendienteSlug: null });
  }

  async updatePasswordHash(id: string, passwordHash: PasswordHash): Promise<void> {
    await this.rows().update({ id }, { hashClave: passwordHash.reveal() });
  }

  private async insertRow(sql: string, row: UsuarioRow): Promise<boolean> {
    const inserted = (await this.context.manager().query(sql, insertParameters(row))) as unknown[];
    return inserted.length > 0;
  }

  private rows(): Repository<UsuarioOrmEntity> {
    return this.context.manager().getRepository(UsuarioOrmEntity);
  }
}
