import { InvalidInputError } from '../../../../shared/domain/errors';

/**
 * El correo no es de un cliente verificado y activo (CA-3, RN-3). HTTP 422 con un mensaje único para los cuatro
 * motivos (no existe, interna, sin verificar, suspendida): no revela cuál es (RN-8).
 */
export class RecipientNotFoundError extends InvalidInputError {
  readonly code = 'SHARING_RECIPIENT_NOT_FOUND';

  constructor() {
    super(
      'No encontramos una cuenta de Nimbo con ese correo. Revisa que esté bien escrito o pídele que se registre.',
    );
  }
}
