import { ConflictError } from '../../../../shared/domain/errors';

/** El comando de alta inicial se niega: ya hay un Administrador activo (011 CA-7). HTTP 409 / salida `1`. */
export class AdminAlreadyExistsError extends ConflictError {
  readonly code = 'IDENTITY_ADMIN_ALREADY_EXISTS';

  constructor() {
    super(
      'Ya hay una cuenta de Administración activa. Pídele a esa persona que dé de alta la nueva cuenta desde el backoffice.',
    );
  }
}
