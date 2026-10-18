import { InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/** Un plan nuevo no cumple CA-11 de la 011 o su nombre ya existe (`NAME_TAKEN`). HTTP 422 con `fields`. */
export class PlanInvalidError extends InvalidInputError {
  readonly code = 'BILLING_PLAN_INVALID';

  constructor(fields: readonly FieldIssue[]) {
    super('Revisa los datos del plan marcados y corrígelos para guardarlo.', fields);
  }
}

/** El nombre (sin distinguir mayúsculas ni espacios en los extremos) o su `slug` ya es de otro plan (RN-4). */
export const NAME_TAKEN_ISSUE: FieldIssue = Object.freeze({
  field: 'name',
  reason: 'NAME_TAKEN',
  message: 'Ya existe un plan con ese nombre. Usa otro nombre.',
});
