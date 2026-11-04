import type { PasswordHash } from '../../../shared/domain/password-hash.vo';
import type { Role } from '../../../shared/domain/role.enum';

import type { AccountStatus } from './account-status.enum';
import type { EmailAddress } from './email-address.vo';
import { AccountStateConflictError } from './errors/account-state-conflict.error';

export interface UserProps {
  readonly id: string;
  readonly fullName: string;
  readonly email: EmailAddress;
  readonly passwordHash: PasswordHash;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly emailVerified: boolean;
}

/** Cuenta de Nimbo (diagrama M1). Las subclases fijan qué roles admiten y qué transiciones tienen. */
export abstract class User {
  readonly id: string;
  readonly fullName: string;
  readonly email: EmailAddress;
  readonly passwordHash: PasswordHash;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly emailVerified: boolean;

  protected constructor(props: UserProps) {
    this.id = props.id;
    this.fullName = props.fullName;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.role = props.role;
    this.status = props.status;
    this.emailVerified = props.emailVerified;
  }

  /** Lanza `AccountStateConflictError` si ya estaba suspendida (011 CA-2). */
  abstract suspend(): User;

  /** Lanza `AccountStateConflictError` si ya estaba activa (011 CA-3). */
  abstract reactivate(): User;

  /** Estado al que pasa la cuenta al suspenderla o reactivarla; ya estar en él es un conflicto (011 CA-2, CA-3). */
  protected transitionTo(target: AccountStatus): AccountStatus {
    if (this.status === target) {
      throw new AccountStateConflictError();
    }
    return target;
  }
}
