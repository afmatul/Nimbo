import { InvalidInputError } from '../../../../shared/domain/errors';

/** El enlace de alta interna venció sin usarse (011 CA-5, Q-3): no hay reenvío. HTTP 422. */
export class SetupLinkExpiredError extends InvalidInputError {
  readonly code = 'IDENTITY_SETUP_LINK_EXPIRED';

  constructor() {
    super(
      'Este enlace venció. Usa «¿Olvidaste tu contraseña?» en el inicio de sesión para crear tu contraseña.',
    );
  }
}
