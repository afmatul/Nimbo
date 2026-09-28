import type { Role } from '../../../shared/domain/role.enum';

import type { AccountStatus } from './account-status.enum';
import type { EmailAddress } from './email-address.vo';
import type { PasswordHash } from './password-hash.vo';

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
}
