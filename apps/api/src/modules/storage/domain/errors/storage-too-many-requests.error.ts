import { TooManyRequestsError } from '../../../../shared/domain/errors';

/** Límite de tasa del inicio de carga o de la URL de descarga (CA-19). HTTP 429 con `Retry-After`. */
export class StorageTooManyRequestsError extends TooManyRequestsError {
  readonly code = 'STORAGE_TOO_MANY_REQUESTS';

  constructor(retryAfterSeconds: number) {
    super(
      'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
      retryAfterSeconds,
    );
  }
}
