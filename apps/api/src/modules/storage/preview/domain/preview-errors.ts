import { DomainError, TooManyRequestsError } from '../../../../shared/domain/errors';

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

/** Conserva el 500 existente sin transportar excepciones privadas al logger del filtro global. */
export class PreviewUrlIssuanceError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly status = 500;

  constructor() {
    super('No se pudo preparar la vista previa. Inténtalo de nuevo más tarde.');
  }
}
