import { InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/**
 * Petición de `sharing` mal formada (CA-3: correo mal escrito; consulta inválida de `GET /shares`). HTTP 422 con
 * `fields` (ADR-0020). El nivel inválido no llega aquí: es `SharingInvalidLevelError` (CA-2).
 */
export class SharingInvalidRequestError extends InvalidInputError {
  readonly code = 'SHARING_INVALID_REQUEST';

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa los datos marcados y vuelve a intentarlo.', fields);
  }
}
