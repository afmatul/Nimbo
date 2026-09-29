import { InvalidInputError } from '../../../../shared/domain/errors';

/** El enlace de verificación existía y venció sin usarse (CA-9). HTTP 422. */
export class VerificationLinkExpiredError extends InvalidInputError {
  readonly code = 'IDENTITY_VERIFICATION_LINK_EXPIRED';

  constructor() {
    super('Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.');
  }
}
