import type { PasswordHash } from '../../../shared/domain/password-hash.vo';
import { Role } from '../../../shared/domain/role.enum';

import { AccountStatus } from './account-status.enum';
import type { EmailAddress } from './email-address.vo';
import type { LegalAcceptance } from './legal-acceptance.vo';
import { User } from './user.entity';

// Sin rol, estado ni verificación: una cuenta registrada desde afuera siempre nace CLIENT (RN-1, CA-7).
export interface RegisterClientInput {
  readonly id: string;
  readonly fullName: string;
  readonly email: EmailAddress;
  readonly passwordHash: PasswordHash;
  readonly acceptance: LegalAcceptance;
}

export interface ReplacePendingRegistrationInput {
  readonly fullName: string;
  readonly passwordHash: PasswordHash;
  readonly acceptance: LegalAcceptance;
}

export interface ClientUserSnapshot extends RegisterClientInput {
  readonly status: AccountStatus;
  readonly emailVerified: boolean;
}

/**
 * Invariante violado por la aplicación (D-10): no es un `DomainError`, así que el filtro HTTP lo
 * trata como error interno y el cliente nunca sabe que la cuenta existía.
 */
export class VerifiedAccountReplacementError extends Error {
  constructor() {
    super('No se puede reemplazar el registro de una cuenta ya verificada.');
    this.name = new.target.name;
  }
}

/** Cuenta de cliente, inmutable: cada transición devuelve una instancia nueva (Art. VII.7). */
export class ClientUser extends User {
  readonly acceptance: LegalAcceptance;

  private constructor(snapshot: ClientUserSnapshot) {
    super({ ...snapshot, role: Role.CLIENT });
    this.acceptance = snapshot.acceptance;
  }

  static register(input: RegisterClientInput): ClientUser {
    return new ClientUser({
      id: input.id,
      fullName: input.fullName,
      email: input.email,
      passwordHash: input.passwordHash,
      acceptance: input.acceptance,
      status: AccountStatus.ACTIVE,
      emailVerified: false,
    });
  }

  /** Reconstruye una cuenta persistida; el rol sigue fijo en CLIENT. */
  static rehydrate(snapshot: ClientUserSnapshot): ClientUser {
    return new ClientUser(snapshot);
  }

  /** Un segundo registro con el mismo correo sin verificar reemplaza los datos (D-10). */
  replacePendingRegistration(input: ReplacePendingRegistrationInput): ClientUser {
    if (this.emailVerified) {
      throw new VerifiedAccountReplacementError();
    }
    return new ClientUser({
      ...this.snapshot(),
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      acceptance: input.acceptance,
    });
  }

  verifyEmail(): ClientUser {
    return new ClientUser({ ...this.snapshot(), emailVerified: true });
  }

  /** Lanza `AccountStateConflictError` si ya estaba suspendida (011 CA-2). No borra datos (RN-6). */
  suspend(): ClientUser {
    return new ClientUser({
      ...this.snapshot(),
      status: this.transitionTo(AccountStatus.SUSPENDED),
    });
  }

  /** Lanza `AccountStateConflictError` si ya estaba activa (011 CA-3). */
  reactivate(): ClientUser {
    return new ClientUser({ ...this.snapshot(), status: this.transitionTo(AccountStatus.ACTIVE) });
  }

  private snapshot(): ClientUserSnapshot {
    return {
      id: this.id,
      fullName: this.fullName,
      email: this.email,
      passwordHash: this.passwordHash,
      acceptance: this.acceptance,
      status: this.status,
      emailVerified: this.emailVerified,
    };
  }
}
