import { ConflictError } from '../../../../shared/domain/errors';

/**
 * El siguiente periodo ya está pagado, o el `vence_en` que vio el cliente cambió mientras pagaba (spec 010 CA-26, RN-9):
 * no se cobra otro. HTTP 409.
 */
export class AlreadyRenewedError extends ConflictError {
  readonly code = 'BILLING_ALREADY_RENEWED';

  constructor() {
    super('Tu plan ya está renovado para el siguiente periodo. No se hizo ningún cargo.');
  }
}
