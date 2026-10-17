import { DomainError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/** La consulta inválida es `400`, como en `storage` y `audit` (011 plan §4), no el `422` de `shared`. */
const BAD_REQUEST = 400;

/**
 * Consulta de una lista del backoffice con un campo inválido (011 plan §4): correo ausente o mal escrito, o una página
 * que no existe. HTTP 400 con el motivo por campo (`fields`); el código coincide con `BACKOFFICE_ERROR_CODES` de
 * `contracts` sin importarlo, como los demás errores de dominio (ADR-0008).
 */
export class InvalidBackofficeQueryError extends DomainError {
  readonly code = 'BACKOFFICE_INVALID_QUERY';
  readonly status = BAD_REQUEST;

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa los datos de la búsqueda y vuelve a intentarlo.', fields);
  }
}
