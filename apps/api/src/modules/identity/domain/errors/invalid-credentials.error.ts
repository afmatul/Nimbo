import { UnauthorizedError } from '../../../../shared/domain/errors';

/** Correo inexistente o contraseña incorrecta: la misma respuesta en los dos casos (CA-2, RN-2). HTTP 401. */
export class InvalidCredentialsError extends UnauthorizedError {
  readonly code = 'IDENTITY_INVALID_CREDENTIALS';

  constructor() {
    super('El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.');
  }
}
