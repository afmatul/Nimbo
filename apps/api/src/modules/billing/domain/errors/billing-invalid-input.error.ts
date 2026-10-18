import { InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/** Uno o más campos de un cobro no cumplen RN-9 (spec 009 CA-5). HTTP 422 con `fields`, sin transacción. */
export class BillingInvalidInputError extends InvalidInputError {
  readonly code = 'BILLING_INVALID_INPUT';

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa los datos de pago marcados y corrígelos para continuar.', fields);
  }
}
