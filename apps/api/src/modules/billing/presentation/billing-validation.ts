import type { DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import { BillingInvalidInputError } from '../domain/errors/billing-invalid-input.error';

/** Fábrica de `ZodValidationPipe` del cobro: 422 `BILLING_INVALID_INPUT` con `fields` (spec 009 CA-5, RN-9). */
export const billingValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new BillingInvalidInputError(issues);
