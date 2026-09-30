import { InvalidInputError } from '../../../../shared/domain/errors';

const MESSAGE = 'La contraseña actual no es correcta.';

/**
 * Contraseña actual incorrecta al cambiarla (CA-23). HTTP 422 y no 401, para que la web no intente renovar la
 * sesión (DT-14); marca el campo `currentPassword`.
 */
export class WrongPasswordError extends InvalidInputError {
  readonly code = 'IDENTITY_WRONG_PASSWORD';

  constructor() {
    super(MESSAGE, [{ field: 'currentPassword', reason: 'WRONG_PASSWORD', message: MESSAGE }]);
  }
}
