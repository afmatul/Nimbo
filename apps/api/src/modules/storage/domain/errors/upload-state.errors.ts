import { ConflictError, DomainError, NotFoundError } from '../../../../shared/domain/errors';

/** Recurso que existió pero ya no está disponible. Base mínima de `storage`: `shared` no tiene un 410. */
const GONE = 410;

/**
 * La carga no existe para este actor: ajena, inexistente, cancelada o rechazada (CA-16, CA-22). HTTP 404, idéntico
 * en todos los casos para no dar oráculo.
 */
export class UploadNotFoundError extends NotFoundError {
  readonly code = 'STORAGE_UPLOAD_NOT_FOUND';

  constructor() {
    super('No encontramos esta carga. Vuelve a subir el archivo.');
  }
}

/** Pasaron 24 h desde el inicio (CA-9). HTTP 410. */
export class UploadExpiredError extends DomainError {
  readonly code = 'STORAGE_UPLOAD_EXPIRED';
  readonly status = GONE;

  constructor() {
    super('Esta carga caducó. Vuelve a subir el archivo.');
  }
}

/** Faltan partes u objeto al completar; la carga sigue reanudable (CA-10). HTTP 409. */
export class UploadIncompleteError extends ConflictError {
  readonly code = 'STORAGE_UPLOAD_INCOMPLETE';

  constructor() {
    super('Aún faltan partes del archivo por subir. Reanuda la carga para completarla.');
  }
}
