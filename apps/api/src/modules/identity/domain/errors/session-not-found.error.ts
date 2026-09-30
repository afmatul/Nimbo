import { NotFoundError } from '../../../../shared/domain/errors';

/** Sesión ajena, inexistente o ya revocada: idénticas para no delatar otras cuentas (CA-12). HTTP 404. */
export class SessionNotFoundError extends NotFoundError {
  readonly code = 'IDENTITY_SESSION_NOT_FOUND';

  constructor() {
    super('No encontramos esa sesión. Actualiza la lista.');
  }
}
