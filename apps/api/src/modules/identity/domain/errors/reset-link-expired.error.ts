import { InvalidInputError } from '../../../../shared/domain/errors';

/** El enlace de recuperación existía y venció sin usarse (CA-20). HTTP 422. */
export class ResetLinkExpiredError extends InvalidInputError {
  readonly code = 'IDENTITY_RESET_LINK_EXPIRED';

  constructor() {
    super('Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.');
  }
}
