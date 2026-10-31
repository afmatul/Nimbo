import { InvalidInputError } from '../../../../shared/domain/errors';

/** El propietario se escribe a sí mismo como destinatario (CA-3; `ck_comparticion_distinto`). HTTP 422. */
export class CannotShareWithSelfError extends InvalidInputError {
  readonly code = 'SHARING_CANNOT_SHARE_WITH_SELF';

  constructor() {
    super('Este elemento ya es tuyo. Escribe el correo de otra persona.');
  }
}
