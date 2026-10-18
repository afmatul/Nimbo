import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { I_NOTIFIER } from '../../notifications';
import type { INotifier } from '../../notifications';
import { I_OBJECT_STORAGE, invoiceObjectKey } from '../../storage';
import type { IObjectStorage } from '../../storage';

import type { BillingLogger } from './billing-logger';
import { I_INVOICE_GENERATOR } from './ports/i-invoice-generator.port';
import type { IInvoiceGenerator } from './ports/i-invoice-generator.port';
import { I_INVOICE_REPOSITORY } from './ports/i-invoice-repository.port';
import type { IInvoiceRepository, IssuableInvoice } from './ports/i-invoice-repository.port';
import { receiptMessage } from './receipt-message';

const PDF_CONTENT_TYPE = 'application/pdf';

/**
 * Emisión del comprobante (spec 009 CA-6, T-07 y T-08): después del commit del cobro y desde el reintento. Lee la factura
 * como su dueño, sube el PDF si falta y, si falta el aviso, lo entrega a `INotifier` y lo marca. Cada paso se salta si
 * ya se hizo, así el reintento no regenera el PDF ni duplica el correo (revisión N-3: método aparte de `retryPending`).
 */
@Injectable()
export class InvoiceIssuer {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_INVOICE_REPOSITORY) private readonly invoices: IInvoiceRepository,
    @Inject(I_INVOICE_GENERATOR) private readonly generator: IInvoiceGenerator,
    @Inject(I_OBJECT_STORAGE) private readonly storage: IObjectStorage,
    @Inject(I_NOTIFIER) private readonly notifier: INotifier,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  /**
   * RN-8 (009): después del commit de un cobro aprobado (contratar, renovar a mano y renovar solo; 010 plan §2). Un fallo
   * del PDF o del aviso no revierte ni falla el cobro: **nunca lanza** y solo deja el nombre del error (el mensaje
   * podría traer datos); `invoice-retry` la repone.
   */
  async issueAfterCommit(actor: Actor, invoiceId: string): Promise<void> {
    try {
      await this.issue(actor, invoiceId);
    } catch (error) {
      this.logger.error({
        event: 'billing.invoice_issue_failed',
        invoiceId,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  async issue(actor: Actor, invoiceId: string): Promise<void> {
    const invoice = await this.transactions.withActor(actor, () =>
      this.invoices.findForIssue(actor, invoiceId),
    );
    if (invoice === null) return;
    if (invoice.objectKey === null) await this.storePdf(actor, invoice);
    if (invoice.noticeQueuedAt === null) await this.sendReceipt(actor, invoice);
  }

  private async storePdf(actor: Actor, invoice: IssuableInvoice): Promise<void> {
    const key = invoiceObjectKey(actor.id, invoice.id);
    const body = await this.generator.generate(invoice.document);
    await this.storage.putObject({ key, body, contentType: PDF_CONTENT_TYPE });
    await this.transactions.withActor(actor, () =>
      this.invoices.markStored(actor, invoice.id, key),
    );
  }

  private async sendReceipt(actor: Actor, invoice: IssuableInvoice): Promise<void> {
    await this.notifier.notify(receiptMessage(invoice, actor.id));
    await this.transactions.withActor(actor, () =>
      this.invoices.markNoticeQueued(actor, invoice.id),
    );
  }
}
