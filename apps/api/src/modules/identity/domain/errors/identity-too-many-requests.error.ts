import { TooManyRequestsError } from '../../../../shared/domain/errors';

import { minutesText } from './minutes-text';

/**
 * Qué límite se alcanzó (plan §7, `identity.rate_limited`): por correo (servicio), por IP de registro o reenvío
 * (`ip`), por IP de inicio de sesión (`ip_login`, 002 DT-20) o por correo al pedir la recuperación
 * (`password_reset`, 002 CA-18).
 */
export type IdentityRateLimitScope = 'email' | 'ip' | 'ip_login' | 'password_reset';

const messageFor = (scope: IdentityRateLimitScope, retryAfterSeconds: number): string =>
  scope === 'ip_login'
    ? 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
    : 'Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en ' +
      `${minutesText(retryAfterSeconds)}.`;

/**
 * Límite de solicitudes alcanzado (001 CA-15, 002 CA-6). HTTP 429 con `Retry-After`. El texto depende del ámbito
 * (DT-20): el mismo código sirve al registro, al reenvío, al inicio de sesión y a la recuperación.
 */
export class IdentityTooManyRequestsError extends TooManyRequestsError {
  readonly code = 'IDENTITY_TOO_MANY_REQUESTS';

  constructor(
    retryAfterSeconds: number,
    readonly scope: IdentityRateLimitScope,
  ) {
    super(messageFor(scope, retryAfterSeconds), retryAfterSeconds);
  }
}
