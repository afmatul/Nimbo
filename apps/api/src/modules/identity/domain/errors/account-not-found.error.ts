import { NotFoundError } from '../../../../shared/domain/errors';

/** La cuenta pedida no existe (011 CA-2, CA-3; plan §4). HTTP 404. */
export class AccountNotFoundError extends NotFoundError {
  readonly code = 'IDENTITY_ACCOUNT_NOT_FOUND';

  constructor() {
    super('No encontramos esta cuenta. Vuelve a la lista de cuentas y búscala de nuevo.');
  }
}
