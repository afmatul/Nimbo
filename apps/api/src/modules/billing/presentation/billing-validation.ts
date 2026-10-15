import { ParseUUIDPipe } from '@nestjs/common';

import type { DomainError, FieldIssue, InvalidInputFactory } from '../../../shared';
import { BillingInvalidInputError } from '../domain/errors/billing-invalid-input.error';
import { InvoiceNotFoundError } from '../domain/errors/invoice-not-found.error';

/** Fábrica de `ZodValidationPipe` del cobro: 422 `BILLING_INVALID_INPUT` con `fields` (spec 009 CA-5, RN-9). */
export const billingValidationError: InvalidInputFactory = (
  issues: readonly FieldIssue[],
): DomainError => new BillingInvalidInputError(issues);

/** `:id` de factura que no es UUID: el mismo 404 que una factura ajena o inexistente (spec 009 CA-8, sin oráculo). */
export const invoiceIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new InvoiceNotFoundError() });
