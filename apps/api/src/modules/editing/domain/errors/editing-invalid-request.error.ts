import { DomainError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

const BAD_REQUEST = 400;

/**
 * Abrir el editor con un cuerpo mal formado (plan 016 §4): solo admite `connectionId`; un nombre visible u otro campo
 * se rechaza (RN-12). HTTP 400 con `fields` (ADR-0020).
 */
export class EditingInvalidRequestError extends DomainError {
  readonly code = 'EDITING_INVALID_REQUEST';
  readonly status = BAD_REQUEST;

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa la petición para abrir el documento y vuelve a intentarlo.', fields);
  }
}
