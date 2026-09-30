import { DomainError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/** `storage` responde la forma inválida con `400` (decisión de Adrián, plan §5), no con el `422` de `shared`. */
const BAD_REQUEST = 400;

/** El inicio de carga no cumple el contrato (CA-7). HTTP 400 con `fields`. */
export class InvalidUploadRequestError extends DomainError {
  readonly code = 'STORAGE_INVALID_UPLOAD_REQUEST';
  readonly status = BAD_REQUEST;

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa el nombre y el tamaño del archivo y vuelve a intentarlo.', fields);
  }
}

/** La consulta del listado no es válida (cursor malformado). HTTP 400 con `fields`. */
export class InvalidQueryError extends DomainError {
  readonly code = 'STORAGE_INVALID_QUERY';
  readonly status = BAD_REQUEST;

  constructor(fields: readonly FieldIssue[]) {
    super(
      'No pudimos leer esta página de la lista. Actualiza la lista e inténtalo de nuevo.',
      fields,
    );
  }
}
