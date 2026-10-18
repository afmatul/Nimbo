import { TooManyRequestsError } from '../../../../shared/domain/errors';

/**
 * Demasiados intentos de abrir el canal desde un mismo origen (CA-14, RNF-07). HTTP 429 con espera. El dominio no
 * importa `@nimbo/contracts` (ADR-0008): la prueba ata `code` a `REALTIME_ERROR_CODES.TOO_MANY_REQUESTS`.
 */
export class RealtimeTooManyRequestsError extends TooManyRequestsError {
  readonly code = 'REALTIME_TOO_MANY_REQUESTS';

  constructor(retryAfterSeconds: number) {
    super(
      'Hiciste demasiados intentos de conexión. Espera un momento e inténtalo de nuevo.',
      retryAfterSeconds,
    );
  }
}
