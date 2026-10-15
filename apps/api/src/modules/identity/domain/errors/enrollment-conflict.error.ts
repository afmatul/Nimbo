import { ConflictError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

/**
 * El correo o el código de empleado del alta ya existen (011 CA-6, RN-5). HTTP 409 con `fields`: `email`
 * (`EMAIL_IN_USE`), `employeeCode` (`EMPLOYEE_CODE_IN_USE`) o ambos.
 */
export class EnrollmentConflictError extends ConflictError {
  readonly code = 'IDENTITY_ENROLLMENT_CONFLICT';

  constructor(fields: readonly FieldIssue[]) {
    super(
      'Ya existe una cuenta con estos datos. Corrige los campos marcados y vuelve a intentarlo.',
      fields,
    );
  }
}
