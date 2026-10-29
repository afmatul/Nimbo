import { InvalidInputError } from '../../../../shared/domain/errors';

/**
 * La cuota total quedaría por debajo de lo usado, `plan + extra < espacio_usado` (011b CA-2, RN-1). HTTP 422 y nada
 * cambia. `details` lleva el usado y el total resultante en bytes como texto decimal (ADR-0016) para el mensaje de la
 * interfaz; el código coincide con `BACKOFFICE_ERROR_CODES` de `contracts` sin importarlo (ADR-0008).
 */
export class QuotaBelowUsageError extends InvalidInputError {
  readonly code = 'BACKOFFICE_QUOTA_BELOW_USAGE';

  constructor(usedBytes: bigint, totalQuotaBytes: bigint) {
    super(
      'La cuota total no puede quedar por debajo de lo que la cuenta ya usa. Elige un espacio extra mayor.',
      undefined,
      { usedBytes: usedBytes.toString(), totalQuotaBytes: totalQuotaBytes.toString() },
    );
  }
}
