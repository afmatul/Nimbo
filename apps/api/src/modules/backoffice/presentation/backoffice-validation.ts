import { ParseUUIDPipe } from '@nestjs/common';

import type { DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import {
  PlanInvalidError,
  PlanNotFoundError,
  QuotaInvalidError,
  ValidityNotExtendedError,
} from '../../billing';
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

/** Fábrica para la forma de un plan nuevo: 422 `BILLING_PLAN_INVALID` con `fields`, como las reglas de CA-11. */
export const planValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new PlanInvalidError(issues);

/** Fábrica para el cuerpo de la cuota: 422 `BACKOFFICE_QUOTA_INVALID` con `fields`, como sus reglas (011b CA-3). */
export const quotaValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new QuotaInvalidError('invalid', issues);

/** Fábrica para el cuerpo de la vigencia: 422 `BACKOFFICE_VALIDITY_NOT_EXTENDED` con `fields` (011b CA-7). */
export const validityValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new ValidityNotExtendedError('not_later', issues);

/** Un `:id` de plan que no es UUID es el mismo 404 `PLAN_NOT_FOUND` que un plan inexistente (plan §4). */
export const planIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new PlanNotFoundError() });
