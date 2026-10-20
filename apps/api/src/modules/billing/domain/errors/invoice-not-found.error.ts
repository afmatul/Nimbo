import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * La factura no existe, no es del cliente o aún no tiene PDF (spec 009 CA-8): la misma respuesta para los tres casos,
 * así no hay oráculo entre «ajena» e «inexistente». HTTP 404.
 */
export class InvoiceNotFoundError extends NotFoundError {
  readonly code = 'BILLING_INVOICE_NOT_FOUND';

  constructor() {
    super('No encontramos esa factura.');
  }
}
