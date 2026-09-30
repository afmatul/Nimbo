import { InvalidInputError } from '../../../../shared/domain/errors';

/** Enlace de recuperación mal formado, desconocido, usado o reemplazado (CA-20). HTTP 422. */
export class ResetLinkInvalidError extends InvalidInputError {
  readonly code = 'IDENTITY_RESET_LINK_INVALID';

  constructor() {
    super('Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.');
  }
}
