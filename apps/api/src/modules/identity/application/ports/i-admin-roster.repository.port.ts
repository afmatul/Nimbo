import type { AccountStatus } from '../../domain/account-status.enum';
import type { EmployeeCode } from '../../domain/employee-code.vo';
import type { InternalUser } from '../../domain/internal-user.entity';

import type { IUserRepository } from './i-user-repository.port';

/**
 * Padrón de cuentas internas para el backoffice (011 plan §2; ISP: registro, login y contraseñas siguen con
 * `IUserRepository` sin estos métodos). Lo implementa el mismo adaptador de `usuario` (`useExisting`). Toma de
 * `IUserRepository` solo las dos lecturas que usan sus consumidores: la fila bloqueada al suspender y el correo de un
 * conflicto de alta.
 */
export interface IAdminRosterRepository extends Pick<
  IUserRepository,
  'findByIdForUpdate' | 'findByEmail'
> {
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

export const I_ADMIN_ROSTER_REPOSITORY = Symbol('IAdminRosterRepository');
