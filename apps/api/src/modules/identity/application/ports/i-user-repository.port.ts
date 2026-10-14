import type { AccountStatus } from '../../domain/account-status.enum';
import type { ClientUser } from '../../domain/client-user.entity';
import type { EmailAddress } from '../../domain/email-address.vo';
import type { EmployeeCode } from '../../domain/employee-code.vo';
import type { InternalUser } from '../../domain/internal-user.entity';
import type { PasswordHash } from '../../domain/password-hash.vo';
import type { User } from '../../domain/user.entity';

/**
 * Cuentas de `usuario` (diagrama M1, plan §6.3). Devuelve `ClientUser` o `InternalUser` según el rol. Dentro de
 * `ITransactionRunner.run` usa la transacción en curso; los `…ForUpdate` bloquean la fila (`SELECT … FOR UPDATE`).
 */
export interface IUserRepository {
  findByEmail(email: EmailAddress): Promise<User | null>;
  findByEmailForUpdate(email: EmailAddress): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByIdForUpdate(id: string): Promise<User | null>;
  /** `INSERT … ON CONFLICT (correo) DO NOTHING`: `false` si otra transacción ya confirmó ese correo (CA-3). */
  insertIfAbsent(user: ClientUser): Promise<boolean>;
  update(user: ClientUser): Promise<void>;
  /**
   * Solo `hash_clave`: sirve a cualquier cuenta, también a una interna, que `identity` no escribe de otro modo
   * (002 CA-19, CA-22).
   */
  updatePasswordHash(id: string, passwordHash: PasswordHash): Promise<void>;
  /**
   * Alta interna (011 CA-5, CA-7): `INSERT … ON CONFLICT DO NOTHING`. `false` si el correo o el código de empleado ya
   * existen; el llamador averigua cuál con `findByEmail` y `findByEmployeeCode` (CA-6).
   */
  insertInternalIfAbsent(user: InternalUser): Promise<boolean>;
  findByEmployeeCode(code: EmployeeCode): Promise<InternalUser | null>;
  /** Solo `estado`, de cualquier cuenta (011 CA-2, CA-3). */
  updateStatus(id: string, status: AccountStatus): Promise<void>;
  /** Estado de la cuenta, o `null` si no existe: si el actor interno sigue activo (011 RN-7). */
  statusOf(id: string): Promise<AccountStatus | null>;
  /** Administradores con estado `activa` (011 RN-7, CA-7). */
  countActiveAdmins(): Promise<number>;
  /**
   * Candado del padrón de Administradores (`pg_advisory_xact_lock`) hasta el fin de la transacción vigente, que exige;
   * reentrante en ella. Serializa las suspensiones y el alta inicial (011 RN-7, CA-7).
   */
  lockAdminRoster(): Promise<void>;
}

export const I_USER_REPOSITORY = Symbol('IUserRepository');
