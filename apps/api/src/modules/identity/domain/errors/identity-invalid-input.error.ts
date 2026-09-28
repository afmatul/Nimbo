import { InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/** Uno o más campos de la solicitud no cumplen el contrato (CA-6, CA-7). HTTP 422 con `fields`. */
export class IdentityInvalidInputError extends InvalidInputError {
  readonly code = 'IDENTITY_INVALID_INPUT';

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa los campos marcados y corrígelos para continuar.', fields);
  }
}
