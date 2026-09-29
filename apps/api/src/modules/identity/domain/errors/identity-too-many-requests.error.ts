import { TooManyRequestsError } from '../../../../shared/domain/errors';

const SECONDS_PER_MINUTE = 60;

/** Qué límite se alcanzó (plan §7, `identity.rate_limited`): por correo (servicio) o por IP (guard). */
export type IdentityRateLimitScope = 'email' | 'ip';

const minutesText = (retryAfterSeconds: number): string => {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE));
  return minutes === 1 ? '1 minuto' : `${String(minutes)} minutos`;
};

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
