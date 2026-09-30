import { ForbiddenError } from '../../../../shared/domain/errors';

/** Contraseña correcta de una cuenta sin verificar (CA-3, 001 CA-16). HTTP 403. */
export class EmailNotVerifiedError extends ForbiddenError {
  readonly code = 'IDENTITY_EMAIL_NOT_VERIFIED';

  constructor() {
    super('Verifica tu correo con el enlace que te enviamos; si venció, pide uno nuevo.');
  }
}
