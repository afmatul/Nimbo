import { ConflictError } from '../../../../shared/domain/errors';

/** Suspenderla dejaría a Nimbo sin ningún Administrador activo (011 CA-4, RN-7). HTTP 409. */
export class LastActiveAdminError extends ConflictError {
  readonly code = 'IDENTITY_LAST_ACTIVE_ADMIN';

  constructor() {
    super(
      'Es la única cuenta de Administración activa. Da de alta o reactiva otra antes de suspender esta.',
    );
  }
}
