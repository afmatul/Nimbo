import { DomainError } from '../../../../shared/domain/errors';

const PAYMENT_REQUIRED = 402;

/**
 * La pasarela rechazó la tarjeta (spec 009 CA-4). Lo lanza solo el controlador, después del commit que conserva la fila
 * `rechazada` (revisión B-3): dentro de la transacción la revertiría. HTTP 402.
 */
export class PaymentRejectedError extends DomainError {
  readonly code = 'BILLING_PAYMENT_REJECTED';
  readonly status = PAYMENT_REQUIRED;

  constructor() {
    super('La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.');
  }
}
