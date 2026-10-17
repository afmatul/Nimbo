import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * El correo no es de ningún cliente (011 CA-13; plan §4). Idéntico para un correo inexistente y para una cuenta
 * interna (003 D-6): no revela si el correo existe. HTTP 404, sin auditoría.
 */
export class ClientNotFoundError extends NotFoundError {
  readonly code = 'BACKOFFICE_CLIENT_NOT_FOUND';

  constructor() {
    super(
      'No encontramos un cliente con ese correo. Revisa que esté bien escrito y búscalo de nuevo.',
    );
  }
}
