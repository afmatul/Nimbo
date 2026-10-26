import { InvalidInputError } from '../../../../shared/domain/errors';

/** Por qué no se extiende la vigencia (011b CA-7): Personal, sin suscripción o un día que no es posterior. */
export type ValidityRejection = 'personal' | 'no_subscription' | 'not_later';

const MESSAGES: Readonly<Record<ValidityRejection, string>> = {
  personal:
    'Personal no vence: no tiene vigencia que extender. Si la cuenta necesita más espacio, dale espacio extra.',
  no_subscription:
    'Esta cuenta aún no tiene una suscripción, así que no tiene vigencia que extender. Vuelve a abrir la ficha más tarde.',
  not_later:
    'Solo puedes extender la vigencia: elige un día posterior al último día vigente que no sea anterior a hoy.',
};

/**
 * La vigencia no se extiende (011b CA-7, RN-2): lo decide `extender_vigencia`, fuente de verdad (ADR-0035). HTTP 422 y
 * nada cambia; el código coincide con `BACKOFFICE_ERROR_CODES` de `contracts` sin importarlo (ADR-0008).
 */
export class ValidityNotExtendedError extends InvalidInputError {
  readonly code = 'BACKOFFICE_VALIDITY_NOT_EXTENDED';

  constructor(rejection: ValidityRejection) {
    super(MESSAGES[rejection]);
  }
}
