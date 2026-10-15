import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { I_OBJECT_STORAGE } from '../../storage';
import type { IObjectStorage } from '../../storage';
import { invoiceObjectKey } from '../domain/entities/invoice.entity';

import { I_INVOICE_GENERATOR } from './ports/i-invoice-generator.port';
import type { IInvoiceGenerator } from './ports/i-invoice-generator.port';
import { I_INVOICE_REPOSITORY } from './ports/i-invoice-repository.port';
import type { IInvoiceRepository } from './ports/i-invoice-repository.port';

const PDF_CONTENT_TYPE = 'application/pdf';

/**
 * Emisión del PDF de la factura (spec 009 CA-6, T-07): después del commit del cobro y desde el reintento. Lee la factura
 * como su dueño, genera el PDF fuera de la transacción, lo sube y guarda la clave. Idempotente: una factura con PDF no
 * se vuelve a emitir (revisión N-3: método aparte de `retryPending`).
 */
@Injectable()
export class InvoiceIssuer {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_INVOICE_REPOSITORY) private readonly invoices: IInvoiceRepository,
    @Inject(I_INVOICE_GENERATOR) private readonly generator: IInvoiceGenerator,
    @Inject(I_OBJECT_STORAGE) private readonly storage: IObjectStorage,
  ) {}

  async issue(actor: Actor, invoiceId: string): Promise<void> {
    const invoice = await this.transactions.withActor(actor, () =>
      this.invoices.findForIssue(actor, invoiceId),
    );
    if (invoice === null || invoice.objectKey !== null) return;
    const key = invoiceObjectKey(actor.id, invoiceId);
    const body = await this.generator.generate(invoice.document);
    await this.storage.putObject({ key, body, contentType: PDF_CONTENT_TYPE });
    await this.transactions.withActor(actor, () => this.invoices.markStored(actor, invoiceId, key));
  }
}
