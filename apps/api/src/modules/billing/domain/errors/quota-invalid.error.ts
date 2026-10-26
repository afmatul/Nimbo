import { InvalidInputError } from '../../../../shared/domain/errors';

/** Por qué no vale el extra (011b CA-3): el extra o la fecha no cumplen RN-1, o la cuenta no tiene suscripción. */
export type QuotaRejection = 'invalid' | 'no_subscription';

const MESSAGES: Readonly<Record<QuotaRejection, string>> = {
  invalid:
    'Revisa el espacio extra: debe ser mayor que cero, la fecha de fin no puede ser anterior a hoy y la cuota total no puede superar el máximo admitido.',
  no_subscription:
    'Esta cuenta aún no tiene una suscripción, así que no tiene cuota que ajustar. Vuelve a abrir la ficha más tarde.',
};

/**
 * El extra no se puede guardar (011b CA-3, RN-1): lo decide `ajustar_cuota_extra`, fuente de verdad (ADR-0035). HTTP
 * 422 y nada cambia; el código coincide con `BACKOFFICE_ERROR_CODES` de `contracts` sin importarlo (ADR-0008).
 */
export class QuotaInvalidError extends InvalidInputError {
  readonly code = 'BACKOFFICE_QUOTA_INVALID';

  constructor(rejection: QuotaRejection) {
    super(MESSAGES[rejection]);
  }
}
