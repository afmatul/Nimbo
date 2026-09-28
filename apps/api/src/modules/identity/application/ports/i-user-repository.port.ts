import type { ClientUser } from '../../domain/client-user.entity';
import type { EmailAddress } from '../../domain/email-address.vo';
import type { User } from '../../domain/user.entity';

/**
 * Cuentas de `usuario` (diagrama M1, plan §6.3). Devuelve `ClientUser` o `InternalUser` según el rol. Dentro de
 * `ITransactionRunner.run` usa la transacción en curso; los `…ForUpdate` bloquean la fila (`SELECT … FOR UPDATE`).
 */
export interface IUserRepository {
  findByEmail(email: EmailAddress): Promise<User | null>;
  findByEmailForUpdate(email: EmailAddress): Promise<User | null>;
  findByIdForUpdate(id: string): Promise<User | null>;
  /** `INSERT … ON CONFLICT (correo) DO NOTHING`: `false` si otra transacción ya confirmó ese correo (CA-3). */
  insertIfAbsent(user: ClientUser): Promise<boolean>;
  update(user: ClientUser): Promise<void>;
}

export const I_USER_REPOSITORY = Symbol('IUserRepository');
