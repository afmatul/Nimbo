import { DomainError } from '../../../../shared/domain/errors';

const BAD_REQUEST = 400;

/**
 * La operación es solo para un plan de pago y la cuenta está en Personal (spec 010 CA-6, CA-11, CA-18, CA-15): Personal
 * no vence, no se renueva ni programa cambios; se contrata (009). HTTP 400 y nada cambia.
 */
export class NoPaidSubscriptionError extends DomainError {
  readonly code = 'BILLING_NO_PAID_SUBSCRIPTION';
  readonly status = BAD_REQUEST;

  constructor() {
    super(
      'Tu cuenta usa el plan Personal, que no se renueva ni se cambia. Contrata un plan en Planes.',
    );
  }
}
