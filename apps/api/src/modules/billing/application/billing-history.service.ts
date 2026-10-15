import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { I_OBJECT_STORAGE } from '../../storage';
import type { IObjectStorage } from '../../storage';
import { InvoiceNotFoundError } from '../domain/errors/invoice-not-found.error';

import { I_BILLING_HISTORY_READER } from './ports/i-billing-history.reader.port';
import type { BillingHistory, IBillingHistoryReader } from './ports/i-billing-history.reader.port';

/** CA-8: el enlace de descarga de la factura vale 5 minutos (RNF-06). */
export const INVOICE_DOWNLOAD_TTL_SECONDS = 300;

export interface InvoiceDownload {
  readonly url: string;
  readonly expiresInSeconds: number;
}

/**
 * Historial y descarga de facturas del cliente (spec 009 CA-7, CA-8). Todo se lee como el dueño, bajo RLS; una factura
 * ajena, inexistente o sin PDF es el mismo `InvoiceNotFoundError`.
 */
@Injectable()
export class BillingHistoryService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_BILLING_HISTORY_READER) private readonly reader: IBillingHistoryReader,
    @Inject(I_OBJECT_STORAGE) private readonly storage: IObjectStorage,
  ) {}

  history(actor: Actor): Promise<BillingHistory> {
    return this.transactions.withActor(actor, () => this.reader.read(actor));
  }

  async download(actor: Actor, invoiceId: string): Promise<InvoiceDownload> {
    const invoice = await this.transactions.withActor(actor, () =>
      this.reader.findDownloadable(actor, invoiceId),
    );
    if (invoice === null) throw new InvoiceNotFoundError();
    const url = await this.storage.presignDownload({
      key: invoice.objectKey,
      fileName: `factura-${invoice.number}.pdf`,
      expiresInSeconds: INVOICE_DOWNLOAD_TTL_SECONDS,
    });
    return { url, expiresInSeconds: INVOICE_DOWNLOAD_TTL_SECONDS };
  }
}
