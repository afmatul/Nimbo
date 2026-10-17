import { ConflictError, NotFoundError } from '../../../../shared/domain/errors';

/**
 * La versión no existe, ya se podó o es de otro archivo (CA-11). HTTP 404, idéntico en todos los casos. Como en 005,
 * el mensaje no lleva el número; la interfaz lo agrega.
 */
export class VersionNotFoundError extends NotFoundError {
  readonly code = 'STORAGE_VERSION_NOT_FOUND';

  constructor() {
    super(
      'No encontramos esta versión. Puede que se haya eliminado al superar las versiones que conserva tu plan. ' +
        'Actualiza el historial para ver las disponibles.',
    );
  }
}

/** Restaurar la versión que ya es la actual (CA-10). HTTP 409; no cambia nada. */
export class VersionAlreadyCurrentError extends ConflictError {
  readonly code = 'STORAGE_VERSION_ALREADY_CURRENT';

  constructor() {
    super('Esta ya es la versión actual.');
  }
}
