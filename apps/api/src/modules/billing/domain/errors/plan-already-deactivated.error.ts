import { ConflictError } from '../../../../shared/domain/errors';

/** El plan ya estaba desactivado (spec 011 CA-10): no hay reactivación. HTTP 409. */
export class PlanAlreadyDeactivatedError extends ConflictError {
  readonly code = 'BILLING_PLAN_ALREADY_DEACTIVATED';

  constructor() {
    super('Este plan ya estaba desactivado. Para ofrecerlo de nuevo, crea un plan nuevo.');
  }
}
