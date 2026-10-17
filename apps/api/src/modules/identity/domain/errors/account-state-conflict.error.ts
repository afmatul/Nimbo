import { ConflictError } from '../../../../shared/domain/errors';

/** Suspender una cuenta ya suspendida o reactivar una activa (011 CA-2, CA-3; plan §4). HTTP 409. */
export class AccountStateConflictError extends ConflictError {
  readonly code = 'IDENTITY_ACCOUNT_STATE_CONFLICT';

  constructor() {
    super('El estado de esta cuenta cambió. Actualiza la ficha para verlo y vuelve a intentarlo.');
  }
}
