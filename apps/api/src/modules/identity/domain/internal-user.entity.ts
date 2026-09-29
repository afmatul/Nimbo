import { Role } from '../../../shared/domain/role.enum';

import { User } from './user.entity';
import type { UserProps } from './user.entity';

/**
 * Cuenta interna (Administrador, Soporte, Operador). En 001 solo se lee: la crea 011. No tiene
 * mutadores para que ningún flujo de cliente pueda alterarla.
 */
export class InternalUser extends User {
  private constructor(props: UserProps) {
    super(props);
  }

  static rehydrate(props: UserProps): InternalUser {
    if (props.role === Role.CLIENT) {
      throw new TypeError('Una cuenta interna no puede tener el rol CLIENT.');
    }
    return new InternalUser(props);
  }
}
