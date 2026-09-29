import { InvalidInputError } from '../../../../shared/domain/errors';
import type { FieldIssue } from '../../../../shared/domain/errors';

const TRAILING_PERIOD = /\.$/;

/** La contraseña es el único campo inválido: el mensaje enumera cada requisito incumplido (CA-5). HTTP 422. */
export class IdentityWeakPasswordError extends InvalidInputError {
  readonly code = 'IDENTITY_WEAK_PASSWORD';

  constructor(fields: readonly FieldIssue[]) {
    const requirements = fields
      .map((issue) => issue.message.replace(TRAILING_PERIOD, ''))
      .join('; ');
    super(
      `Tu contraseña no cumple estos requisitos: ${requirements}. Elige otra que los cumpla.`,
      fields,
    );
  }
}
