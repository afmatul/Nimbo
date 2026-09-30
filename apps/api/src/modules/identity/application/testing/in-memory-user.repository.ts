import { ClientUser } from '../../domain/client-user.entity';
import type { EmailAddress } from '../../domain/email-address.vo';
import { InternalUser } from '../../domain/internal-user.entity';
import type { PasswordHash } from '../../domain/password-hash.vo';
import type { User } from '../../domain/user.entity';
import type { IUserRepository } from '../ports/i-user-repository.port';

const withPasswordHash = (user: User, passwordHash: PasswordHash): User => {
  const common = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    passwordHash,
    status: user.status,
    emailVerified: user.emailVerified,
  };
  return user instanceof ClientUser
    ? ClientUser.rehydrate({ ...common, acceptance: user.acceptance })
    : InternalUser.rehydrate({ ...common, role: user.role });
};

/** Doble en memoria de `IUserRepository` para las pruebas de aplicación: el correo es único, como `uq_usuario_correo`. */
export class InMemoryUserRepository implements IUserRepository {
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

  update(user: ClientUser): Promise<void> {
    this.users.set(user.id, user);
    return Promise.resolve();
  }

  /** Como el `UPDATE` de `hash_clave`: la misma cuenta con el hash nuevo, cliente o interna. */
  updatePasswordHash(id: string, passwordHash: PasswordHash): Promise<void> {
    const user = this.users.get(id);
    if (user !== undefined) {
      this.users.set(id, withPasswordHash(user, passwordHash));
    }
    return Promise.resolve();
  }
}
