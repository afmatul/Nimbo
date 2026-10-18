import { DomainError } from '../../../../shared/domain/errors';

const BAD_REQUEST = 400;

/**
 * El plan no se puede contratar (spec 009 CA-5): no existe, está desactivado, es gratuito o la cuenta ya no está en
 * Personal (el cambio de plan es de la 010). HTTP 400, sin transacción ni cargo.
 */
export class PlanNotAvailableError extends DomainError {
  readonly code = 'BILLING_PLAN_NOT_AVAILABLE';
  readonly status = BAD_REQUEST;

  constructor() {
    super('Este plan no está disponible para contratar. Elige otro plan en Planes.');
  }
}
