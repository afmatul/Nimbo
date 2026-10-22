import { ConflictError } from '../../../../shared/domain/errors';

/**
 * Con cualquier cambio de plan programado y la cuenta vigente no se renueva por adelantado (spec 010 CA-28, B-1): el
 * cambio se aplica al vencer. HTTP 409 y no hay cobro.
 */
export class PlanChangePendingError extends ConflictError {
  readonly code = 'BILLING_PLAN_CHANGE_PENDING';

  constructor() {
    super(
      'Tienes un cambio de plan programado. Cancélalo para renovar ahora o espera a que se aplique al vencer.',
    );
  }
}
