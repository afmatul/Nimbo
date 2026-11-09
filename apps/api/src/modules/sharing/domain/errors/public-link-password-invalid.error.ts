import { ForbiddenError } from '../../../../shared/domain/errors';

/**
 * El enlace pide contraseña y falta o no coincide (013 CA-12). HTTP 403, no 401: `401` es «sin sesión» en toda la API
 * (plan §4). No dice cuántos intentos quedan (P-3).
 */
export class PublicLinkPasswordInvalidError extends ForbiddenError {
  readonly code = 'SHARING_LINK_PASSWORD_INVALID';

  constructor() {
    super('La contraseña no es correcta. Revísala y vuelve a intentarlo.');
  }
}
