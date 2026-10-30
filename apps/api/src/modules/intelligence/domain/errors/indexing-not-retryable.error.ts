import { ConflictError } from '../../../../shared/domain/errors';

/**
 * «Reintentar» sobre un archivo cuya indexación no está `fallido` (CA-13, plan 019 §4). HTTP 409. El dominio no importa
 * `@nimbo/contracts` (ADR-0008): la prueba ata `code` a `INTELLIGENCE_ERROR_CODES`.
 */
export class IndexingNotRetryableError extends ConflictError {
  readonly code = 'INTELLIGENCE_INDEXING_NOT_RETRYABLE';

  constructor() {
    super(
      'Este archivo no tiene una indexación fallida que reintentar. Actualiza la página para ver su estado.',
    );
  }
}
