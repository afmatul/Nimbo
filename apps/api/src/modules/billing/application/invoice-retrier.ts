import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { ITransactionRunner } from '../../../shared';
import {
  attemptEach,
  createActor,
  I_TRANSACTION_RUNNER,
  Role,
  IncompleteBatchError,
} from '../../../shared';

import type { BillingLogger } from './billing-logger';
import { InvoiceIssuer } from './invoice-issuer';
import { INVOICE_RETRY_CONFIG } from './invoice-retry-config';
import type { InvoiceRetryConfig } from './invoice-retry-config';
import { I_PENDING_INVOICE_SCANNER } from './ports/i-pending-invoice.scanner.port';
import type { IPendingInvoiceScanner } from './ports/i-pending-invoice.scanner.port';

/** Quedaron facturas sin PDF o sin aviso (CA-6): la pasada falla para que BullMQ la reintente. Sin ids ni cuentas. */
export class InvoiceRetryIncompleteError extends IncompleteBatchError {
  constructor(failed: number) {
    super(
      failed,
      `El reintento de facturas dejó ${String(failed)} factura(s) sin PDF o sin aviso; se reintentará.`,
    );
  }
}

/**
 * Reintento de facturas sin PDF o sin aviso (spec 009 CA-6, T-07 y T-08; revisión N-3: método aparte de `issue`). Lista
 * un lote sin actor con `IPendingInvoiceScanner` y completa cada una como su dueño con `InvoiceIssuer`, que sube el PDF
 * y entrega el aviso que falten. El fallo de una no frena las demás.
 */
@Injectable()
export class InvoiceRetrier {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_PENDING_INVOICE_SCANNER) private readonly scanner: IPendingInvoiceScanner,
    @Inject(InvoiceIssuer) private readonly issuer: InvoiceIssuer,
    @Inject(INVOICE_RETRY_CONFIG) private readonly config: InvoiceRetryConfig,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async retryPending(): Promise<void> {
    const pending = await this.transactions.run(() =>
      this.scanner.listPending(this.config.batchSize),
    );
    const failed = await attemptEach(
      pending,
      ({ invoiceId, userId }) => this.issuer.issue(createActor(userId, Role.CLIENT), invoiceId),
      ({ invoiceId }, failure) =>
        this.logger.error({
          event: 'billing.invoice_retry_failed',
          invoiceId,
          errorName: failure.errorName,
        }),
    );
    this.logger.info({ event: 'billing.invoice_retry_run', scanned: pending.length, failed });
    if (failed > 0) throw new InvoiceRetryIncompleteError(failed);
  }
}
