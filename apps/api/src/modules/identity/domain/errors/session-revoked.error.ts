import { UnauthorizedError } from '../../../../shared/domain/errors';

/** Sesión revocada, reúso de un token rotado o cuenta suspendida (CA-9, CA-10). HTTP 401. */
export class SessionRevokedError extends UnauthorizedError {
  readonly code = 'IDENTITY_SESSION_REVOKED';

  constructor() {
    super('Tu sesión se cerró. Inicia sesión de nuevo.');
  }
}
