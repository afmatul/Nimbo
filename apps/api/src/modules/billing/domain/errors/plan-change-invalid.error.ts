import { DomainError } from '../../../../shared/domain/errors';

const BAD_REQUEST = 400;

/**
 * El plan elegido para el cambio no existe, está desactivado, no es de pago ni Personal o es el mismo que ya tiene
 * (spec 010 CA-17). HTTP 400 y nada cambia.
 */
export class PlanChangeInvalidError extends DomainError {
  readonly code = 'BILLING_PLAN_CHANGE_INVALID';
  readonly status = BAD_REQUEST;

  constructor() {
    super(
      'No pudimos programar el cambio. Ese plan ya no está disponible. Cierra este aviso y elige otro plan de la lista.',
    );
  }
}
