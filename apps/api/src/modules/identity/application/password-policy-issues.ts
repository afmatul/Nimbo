import { evaluatePassword, IDENTITY_FIELD_MESSAGES } from '@nimbo/contracts';

import type { FieldIssue } from '../../../shared';
import type { EmailAddress } from '../domain/email-address.vo';

/**
 * Reglas de la política de contraseñas (001 D-6) que `password` no cumple, como `fields` sobre `field`. Completa los
 * esquemas con «igual al correo», que solo el servicio conoce (002 CA-21, CA-22; 011 CA-5).
 */
export const weakPasswordIssues = (
  password: string,
  email: EmailAddress,
  field: string,
): FieldIssue[] =>
  evaluatePassword(password, email.value)
    .filter((result) => !result.passed)
    .map(({ reason }) => ({ field, reason, message: IDENTITY_FIELD_MESSAGES[reason] }));
