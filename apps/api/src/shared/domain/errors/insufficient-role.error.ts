import { ForbiddenError } from './forbidden.error';

const MESSAGE =
  'Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos.';

/** Rol no listado en `@Roles(...)` o ruta sin declarar (003 CA-5, CA-6, DT-2). */
export class InsufficientRoleError extends ForbiddenError {
  readonly code = 'SHARED_FORBIDDEN';

  constructor() {
    super(MESSAGE);
  }
}
