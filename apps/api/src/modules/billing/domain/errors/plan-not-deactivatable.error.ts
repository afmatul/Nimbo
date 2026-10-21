import { ConflictError } from '../../../../shared/domain/errors';

/** Personal no se desactiva (spec 011 CA-11): es el plan de toda cuenta nueva. HTTP 409. */
export class PlanNotDeactivatableError extends ConflictError {
  readonly code = 'BILLING_PLAN_NOT_DEACTIVATABLE';

  constructor() {
    super('El plan Personal no se puede desactivar: es el plan de toda cuenta nueva.');
  }
}
