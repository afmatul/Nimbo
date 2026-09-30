import { UnauthorizedError } from '../../../../shared/domain/errors';

/**
 * Token de refresco ausente, mal formado, desconocido o anterior dentro de la gracia (CA-9). HTTP 401. No borra la
 * cookie: en una carrera entre pestañas la del navegador ya puede ser la nueva.
 */
export class RefreshInvalidError extends UnauthorizedError {
  readonly code = 'IDENTITY_REFRESH_INVALID';

  constructor() {
    super('Tu sesión no es válida. Inicia sesión de nuevo.');
  }
}
