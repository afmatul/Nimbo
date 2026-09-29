import type { ClientUser } from '../../domain/client-user.entity';
import type { EmailAddress } from '../../domain/email-address.vo';
import type { User } from '../../domain/user.entity';
import type { IUserRepository } from '../ports/i-user-repository.port';

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

  findByIdForUpdate(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
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
}
