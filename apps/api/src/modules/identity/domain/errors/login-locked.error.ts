import { TooManyRequestsError } from '../../../../shared/domain/errors';

import { minutesText } from './minutes-text';

/** Correo bloqueado por intentos fallidos, exista o no la cuenta (CA-5, D-5). HTTP 429 con `Retry-After`. */
export class LoginLockedError extends TooManyRequestsError {
  readonly code = 'IDENTITY_LOGIN_LOCKED';

  constructor(retryAfterSeconds: number) {
    super(
      `Hubo demasiados intentos fallidos. Espera ${minutesText(retryAfterSeconds)} o restablece tu contraseña.`,
      retryAfterSeconds,
    );
  }
}
