import { randomUUID } from 'node:crypto';

import { Role } from '../../../../shared/domain/role.enum';
import { AccountStatus } from '../../domain/account-status.enum';
import { EmailAddress } from '../../domain/email-address.vo';
import { EmployeeCode } from '../../domain/employee-code.vo';
import { InternalUser } from '../../domain/internal-user.entity';
import { PasswordHash } from '../../domain/password-hash.vo';

/** Builder de cuentas internas para pruebas de aplicación (conventions §Pruebas): activas y con id y código únicos. */
export class InternalUserBuilder {
  private id = randomUUID();
  private role: Role = Role.ADMIN;
  private status = AccountStatus.ACTIVE;
  private email = `interna-${this.id}@nimbo.me`;
  private employeeCode = `E-${this.id.slice(0, 8).toUpperCase()}`;

  withRole(role: Role): this {
    this.role = role;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  withEmployeeCode(code: string): this {
    this.employeeCode = code;
    return this;
  }

  suspended(): this {
    this.status = AccountStatus.SUSPENDED;
    return this;
  }

  build(): InternalUser {
    return InternalUser.rehydrate({
      id: this.id,
      fullName: 'Persona Interna',
      email: EmailAddress.of(this.email),
      passwordHash: PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aW50ZXJuYQ'),
      role: this.role,
      status: this.status,
      emailVerified: true,
      employeeCode: EmployeeCode.of(this.employeeCode),
    });
  }
}

export const anInternalUser = (): InternalUserBuilder => new InternalUserBuilder();
