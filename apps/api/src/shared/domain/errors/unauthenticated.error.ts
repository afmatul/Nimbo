import { UnauthorizedError } from './unauthorized.error';

const MESSAGE = 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.';

/** Ruta no pública sin token de acceso válido (003 CA-1, CA-2). El motivo va solo a la bitácora. */
export class UnauthenticatedError extends UnauthorizedError {
  readonly code = 'SHARED_UNAUTHENTICATED';

  constructor() {
    super(MESSAGE);
  }
}
