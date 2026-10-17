import { ConflictError } from '../../../../shared/domain/errors';

/** Un Administrador intentó suspender o reactivar su propia cuenta (011 CA-4, RN-7). HTTP 409. */
export class CannotChangeOwnStatusError extends ConflictError {
  readonly code = 'IDENTITY_CANNOT_CHANGE_OWN_STATUS';

  constructor() {
    super(
      'No puedes suspender ni reactivar tu propia cuenta. Pide a otra persona de Administración que lo haga.',
    );
  }
}
