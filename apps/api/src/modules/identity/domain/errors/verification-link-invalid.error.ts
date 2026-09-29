import { InvalidInputError } from '../../../../shared/domain/errors';

/** Enlace mal formado, desconocido, usado o reemplazado por otro más reciente (CA-11). HTTP 422. */
export class VerificationLinkInvalidError extends InvalidInputError {
  readonly code = 'IDENTITY_VERIFICATION_LINK_INVALID';

  constructor() {
    super('Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.');
  }
}
