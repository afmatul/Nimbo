import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * El propietario revoca un enlace ajeno, inexistente o ya revocado (013 CA-8). HTTP 404 idéntico en los tres casos: no
 * revela si el `linkId` existe en otra cuenta.
 */
export class PublicLinkNotFoundError extends NotFoundError {
  readonly code = 'SHARING_LINK_NOT_FOUND';

  constructor() {
    super('Este enlace ya no existe. Actualiza para ver el estado actual.');
  }
}
