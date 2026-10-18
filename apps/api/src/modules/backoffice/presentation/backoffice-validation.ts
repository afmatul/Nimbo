import { ParseUUIDPipe } from '@nestjs/common';

import type { DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import { AccountNotFoundError, IdentityInvalidInputError } from '../../identity';
import { InvalidBackofficeQueryError } from '../domain/errors/invalid-backoffice-query.error';

/** Fábrica de `ZodValidationPipe` para las listas: 400 `BACKOFFICE_INVALID_QUERY` con `fields` (011 plan §4). */
export const backofficeQueryValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new InvalidBackofficeQueryError(issues);

/** Fábrica para el alta interna (incluido el rol Cliente): 422 `IDENTITY_INVALID_INPUT` con `fields` (CA-6). */
export const enrollmentValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new IdentityInvalidInputError(issues);

/** Un `:id` de cuenta que no es UUID es el mismo 404 que una cuenta inexistente (plan §4). */
export const accountIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new AccountNotFoundError() });
