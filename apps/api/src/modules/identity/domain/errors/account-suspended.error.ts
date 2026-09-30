import { ForbiddenError } from '../../../../shared/domain/errors';

/**
 * Contraseña correcta de una cuenta suspendida (CA-4, D-10). HTTP 403. El correo de contacto llega por constructor
 * porque el dominio no importa `contracts` (ADR-0008).
 */
export class AccountSuspendedError extends ForbiddenError {
  readonly code = 'IDENTITY_ACCOUNT_SUSPENDED';

  constructor(contactEmail: string) {
    super(`Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${contactEmail}.`);
  }
}
