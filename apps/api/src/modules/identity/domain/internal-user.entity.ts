import type { PasswordHash } from '../../../shared/domain/password-hash.vo';
import { Role } from '../../../shared/domain/role.enum';

import { AccountStatus } from './account-status.enum';
import type { EmailAddress } from './email-address.vo';
import type { EmployeeCode } from './employee-code.vo';
import { User } from './user.entity';
import type { UserProps } from './user.entity';

/** Una cuenta interna persistida: los datos de `User` más su código de empleado (011 RN-5). */
export interface InternalUserProps extends UserProps {
  readonly employeeCode: EmployeeCode;
}

/**
 * Alta interna (011 CA-5, CA-7): sin estado ni verificación, que fija `enroll`. `passwordHash` es el de un secreto
 * aleatorio que nadie conoce; la persona fija la suya con el enlace de alta.
 */
export interface EnrollInternalInput {
  readonly id: string;
  readonly fullName: string;
  readonly email: EmailAddress;
  readonly employeeCode: EmployeeCode;
  readonly role: Role;
  readonly passwordHash: PasswordHash;
}

/**
 * Cuenta interna (Administrador, Soporte, Operador), inmutable: cada transición devuelve una instancia nueva
 * (Art. VII.7). La crea 011 (`enroll`); ningún flujo de cliente la altera.
 */
export class InternalUser extends User {
  readonly employeeCode: EmployeeCode;

  private constructor(props: InternalUserProps) {
    super(props);
    this.employeeCode = props.employeeCode;
  }

  /** Nace activa y con el correo verificado (Q-3); el rol nunca es `CLIENT` (RN-5). */
  static enroll(input: EnrollInternalInput): InternalUser {
    return InternalUser.rehydrate({
      ...input,
      status: AccountStatus.ACTIVE,
      emailVerified: true,
    });
  }

  static rehydrate(props: InternalUserProps): InternalUser {
    if (props.role === Role.CLIENT) {
      throw new TypeError('Una cuenta interna no puede tener el rol CLIENT.');
    }
    return new InternalUser(props);
  }

  /** Lanza `AccountStateConflictError` si ya estaba suspendida (011 CA-2). */
  suspend(): InternalUser {
    return new InternalUser({
      ...this.props(),
      status: this.transitionTo(AccountStatus.SUSPENDED),
    });
  }

  /** Lanza `AccountStateConflictError` si ya estaba activa (011 CA-3). */
  reactivate(): InternalUser {
    return new InternalUser({ ...this.props(), status: this.transitionTo(AccountStatus.ACTIVE) });
  }

  /** La primera contraseña, con el enlace de alta (011 CA-5). */
  setFirstPassword(passwordHash: PasswordHash): InternalUser {
    return new InternalUser({ ...this.props(), passwordHash });
  }

  private props(): InternalUserProps {
    return {
      id: this.id,
      fullName: this.fullName,
      email: this.email,
      passwordHash: this.passwordHash,
      role: this.role,
      status: this.status,
      emailVerified: this.emailVerified,
      employeeCode: this.employeeCode,
    };
  }
}
