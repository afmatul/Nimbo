import { UnauthorizedError } from '../../../../shared/domain/errors';

/** Sesión vencida por inactividad o por su vida máxima (CA-8, D-2). HTTP 401. */
export class SessionExpiredError extends UnauthorizedError {
  readonly code = 'IDENTITY_SESSION_EXPIRED';

  constructor() {
    super('Tu sesión terminó. Inicia sesión de nuevo.');
  }
}
