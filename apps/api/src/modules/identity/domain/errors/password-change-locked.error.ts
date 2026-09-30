import { TooManyRequestsError } from '../../../../shared/domain/errors';

import { minutesText } from './minutes-text';

/** Cambio de contraseña bloqueado por contraseñas actuales incorrectas (CA-23, D-7). HTTP 429 con `Retry-After`. */
export class PasswordChangeLockedError extends TooManyRequestsError {
  readonly code = 'IDENTITY_PASSWORD_CHANGE_LOCKED';

  constructor(retryAfterSeconds: number) {
    super(
      'Hiciste demasiados intentos con una contraseña incorrecta. ' +
        `Espera ${minutesText(retryAfterSeconds)} o restablece tu contraseña.`,
      retryAfterSeconds,
    );
  }
}
