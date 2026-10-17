import { Role } from '../../../../shared/domain/role.enum';
import { AccountStatus } from '../../domain/account-status.enum';
import { ClientUser } from '../../domain/client-user.entity';
import type { EmailAddress } from '../../domain/email-address.vo';
import type { EmployeeCode } from '../../domain/employee-code.vo';
import { InternalUser } from '../../domain/internal-user.entity';
import type { PasswordHash } from '../../domain/password-hash.vo';
import type { User } from '../../domain/user.entity';
import type { IAdminRosterRepository } from '../ports/i-admin-roster.repository.port';
import type { IUserRepository } from '../ports/i-user-repository.port';

/** Columnas que el repositorio actualiza sueltas: `hash_clave` y `estado`. */
interface RowPatch {
  readonly passwordHash?: PasswordHash;
  readonly status?: AccountStatus;
}

/** La misma cuenta, cliente o interna, con las columnas de `patch` cambiadas (como un `UPDATE`). */
const withPatch = (user: User, patch: RowPatch): User => {
  const common = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    passwordHash: patch.passwordHash ?? user.passwordHash,
    status: patch.status ?? user.status,
    emailVerified: user.emailVerified,
  };
  return user instanceof InternalUser
    ? InternalUser.rehydrate({ ...common, role: user.role, employeeCode: user.employeeCode })
    : ClientUser.rehydrate({ ...common, acceptance: (user as ClientUser).acceptance });
};

/**
 * Doble en memoria de `IUserRepository` e `IAdminRosterRepository` para las pruebas de aplicación: correo y código de
 * empleado únicos, como `uq_usuario_correo` y `uq_usuario_codigo_empleado`. Sin transacciones, `lockAdminRoster` no
 * tiene nada que serializar.
 */
export class InMemoryUserRepository implements IUserRepository, IAdminRosterRepository {
  private readonly users = new Map<string, User>();

  all(): readonly User[] {
    return [...this.users.values()];
  }

  /** Deja una cuenta ya persistida (cliente o interna) antes del caso de uso. */
  seed(user: User): void {
    this.users.set(user.id, user);
  }

  findByEmail(email: EmailAddress): Promise<User | null> {
    const found = this.all().find((user) => user.email.equals(email));
    return Promise.resolve(found ?? null);
  }

  findByEmailForUpdate(email: EmailAddress): Promise<User | null> {
    return this.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByIdForUpdate(id: string): Promise<User | null> {
    return this.findById(id);
  }

  async insertIfAbsent(user: ClientUser): Promise<boolean> {
    if ((await this.findByEmail(user.email)) !== null) {
      return false;
    }
    this.users.set(user.id, user);
    return true;
  }

  async insertInternalIfAbsent(user: InternalUser): Promise<boolean> {
    const taken =
      (await this.findByEmail(user.email)) !== null ||
      (await this.findByEmployeeCode(user.employeeCode)) !== null;
    if (!taken) this.users.set(user.id, user);
    return !taken;
  }

  findByEmployeeCode(code: EmployeeCode): Promise<InternalUser | null> {
    const found = this.all().find(
      (user): user is InternalUser =>
        user instanceof InternalUser && user.employeeCode.equals(code),
    );
    return Promise.resolve(found ?? null);
  }

  update(user: ClientUser): Promise<void> {
    this.users.set(user.id, user);
    return Promise.resolve();
  }

  /** Como el `UPDATE` de `hash_clave`: la misma cuenta con el hash nuevo, cliente o interna. */
  updatePasswordHash(id: string, passwordHash: PasswordHash): Promise<void> {
    return this.patch(id, { passwordHash });
  }

  updateStatus(id: string, status: AccountStatus): Promise<void> {
    return this.patch(id, { status });
  }

  statusOf(id: string): Promise<AccountStatus | null> {
    return Promise.resolve(this.users.get(id)?.status ?? null);
  }

  countActiveAdmins(): Promise<number> {
    const admins = this.all().filter(
      (user) => user.role === Role.ADMIN && user.status === AccountStatus.ACTIVE,
    );
    return Promise.resolve(admins.length);
  }

  lockAdminRoster(): Promise<void> {
    return Promise.resolve();
  }

  private patch(id: string, patch: RowPatch): Promise<void> {
    const user = this.users.get(id);
    if (user !== undefined) {
      this.users.set(id, withPatch(user, patch));
    }
    return Promise.resolve();
  }
}
