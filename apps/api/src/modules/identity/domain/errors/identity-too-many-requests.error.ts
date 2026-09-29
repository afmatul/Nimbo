import { TooManyRequestsError } from '../../../../shared/domain/errors';

import { minutesText } from './minutes-text';

/** Qué límite se alcanzó (plan §7, `identity.rate_limited`): por correo (servicio) o por IP (guard). */
export type IdentityRateLimitScope = 'email' | 'ip';

/** Límite de registro o reenvío alcanzado (CA-15). HTTP 429 con `Retry-After`. */
export class IdentityTooManyRequestsError extends TooManyRequestsError {
  readonly code = 'IDENTITY_TOO_MANY_REQUESTS';

  constructor(
    retryAfterSeconds: number,
    readonly scope: IdentityRateLimitScope,
  ) {
    super(
      'Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en ' +
        `${minutesText(retryAfterSeconds)}.`,
      retryAfterSeconds,
    );
  }
}
