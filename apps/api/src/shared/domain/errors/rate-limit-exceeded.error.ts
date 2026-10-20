import { TooManyRequestsError } from './too-many-requests.error';

/**
 * Límite de tasa compartido (spec 009 §5, `SHARED_TOO_MANY_REQUESTS`): HTTP 429 con `Retry-After`. `identity` y
 * `storage` tienen el suyo y se unifican en este más adelante (pendiente de la 009).
 */
export class RateLimitExceededError extends TooManyRequestsError {
  readonly code = 'SHARED_TOO_MANY_REQUESTS';

  constructor(retryAfterSeconds: number) {
    super(
      'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      retryAfterSeconds,
    );
  }
}
