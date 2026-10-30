import { TooManyRequestsError } from '../../../../shared';

/** Límite de emisión de URLs de previsualización. HTTP 429 con Retry-After. */
export class PreviewTooManyRequestsError extends TooManyRequestsError {
  readonly code = 'STORAGE_TOO_MANY_REQUESTS';

  constructor(retryAfterSeconds: number) {
    super(
      'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
      retryAfterSeconds,
    );
  }
}
