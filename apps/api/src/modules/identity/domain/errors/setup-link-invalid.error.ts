import { InvalidInputError } from '../../../../shared/domain/errors';

/** Enlace de alta interna mal formado, desconocido o ya usado (011 CA-5). HTTP 422. */
export class SetupLinkInvalidError extends InvalidInputError {
  readonly code = 'IDENTITY_SETUP_LINK_INVALID';

  constructor() {
    super(
      'Este enlace no es válido o ya se usó. Si ya creaste tu contraseña, inicia sesión; si no, usa «¿Olvidaste tu contraseña?».',
    );
  }
}
