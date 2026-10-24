import { NotFoundError } from '../../../../shared/domain/errors';

/** No hay un cambio de plan programado que cancelar o aplicar (spec 010 CA-19). HTTP 404. */
export class NoPendingPlanChangeError extends NotFoundError {
  readonly code = 'BILLING_NO_PENDING_PLAN_CHANGE';

  constructor() {
    super('No tienes un cambio de plan programado. Recarga la página para ver tu plan actual.');
  }
}
