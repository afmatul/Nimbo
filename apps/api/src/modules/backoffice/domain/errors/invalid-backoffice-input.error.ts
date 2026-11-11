import { InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/**
 * Cuerpo de una acción del backoffice con un campo inválido (011b CA-12): correo, motivo o tipo al restaurar. HTTP 422
 * con el motivo por campo (`fields`); el código coincide con `BACKOFFICE_ERROR_CODES` de `contracts` sin importarlo
 * (ADR-0008). Una consulta inválida es `InvalidBackofficeQueryError` (400).
 */
export class InvalidBackofficeInputError extends InvalidInputError {
  readonly code = 'BACKOFFICE_INVALID_INPUT';

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa los campos marcados y corrígelos para continuar.', fields);
  }
}
