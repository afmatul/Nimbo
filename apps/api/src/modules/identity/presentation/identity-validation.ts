import { FIELD_ISSUE_REASONS } from '@nimbo/contracts';

import type { DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import { IdentityInvalidInputError, IdentityWeakPasswordError } from '../domain/errors';

const PASSWORD_FIELD = 'password';
const PASSWORD_RULE_PREFIX = 'PASSWORD_';
/** Reglas de composición de la contraseña (D-6); `REQUIRED` no es una: una contraseña ausente es un campo faltante. */
const PASSWORD_RULE_REASONS: ReadonlySet<string> = new Set(
  FIELD_ISSUE_REASONS.filter((reason) => reason.startsWith(PASSWORD_RULE_PREFIX)),
);

const isPasswordRule = (issue: FieldIssue): boolean =>
  issue.field === PASSWORD_FIELD && PASSWORD_RULE_REASONS.has(issue.reason);

/**
 * Fábrica de errores de entrada de `identity` para `ZodValidationPipe` (ADR-0020, plan §5). Si el único problema es
 * la contraseña, `IDENTITY_WEAK_PASSWORD` enumera sus reglas (CA-5); en otro caso, `IDENTITY_INVALID_INPUT` con
 * todos los campos, incluidas las reglas de la contraseña y los campos no declarados (CA-6, CA-7).
 */
export const identityValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError =>
  issues.length > 0 && issues.every(isPasswordRule)
    ? new IdentityWeakPasswordError(issues)
    : new IdentityInvalidInputError(issues);
