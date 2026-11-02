import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * Revocar o salir de un acceso ajeno, inexistente o ya revocado (CA-11, CA-23). HTTP 404 idéntico en los tres casos:
 * no revela si el `shareId` existe en otra cuenta.
 */
export class ShareNotFoundError extends NotFoundError {
  readonly code = 'SHARING_SHARE_NOT_FOUND';

  constructor() {
    super('Este acceso ya no existe. Actualiza la lista.');
  }
}
