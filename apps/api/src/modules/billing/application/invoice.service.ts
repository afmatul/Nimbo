import { Inject, Injectable } from '@nestjs/common';
import { breakdown } from '@nimbo/contracts';

import type { Actor } from '../../../shared';
import { AccountContactReader } from '../../identity';
import type { Invoice } from '../domain/entities/invoice.entity';
import type { Payment } from '../domain/entities/payment.entity';
import { BillingInvariantError } from '../domain/errors/billing-invariant.error';
import { Money } from '../domain/value-objects/money';

import { I_INVOICE_REPOSITORY } from './ports/i-invoice-repository.port';
import type { IInvoiceRepository } from './ports/i-invoice-repository.port';

/**
 * Factura del pago (spec 009 CA-6). `register` corre dentro de la transacción del cobro: inserta la fila con el
 * desglose de RN-2 (`breakdown`), el NIT y el correo del comprobante, sin PDF ni aviso todavía. Generar y subir el PDF
 * (`issue`) es de la T-07, después del commit (revisión I-10).
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(I_INVOICE_REPOSITORY) private readonly invoices: IInvoiceRepository,
    @Inject(AccountContactReader) private readonly contacts: AccountContactReader,
  ) {}

  async register(actor: Actor, payment: Payment, nit: string): Promise<Invoice> {
    if (payment.status !== 'aprobada')
      throw new BillingInvariantError('Solo un pago aprobado se factura (CA-6).');
    const { subtotalCents, vatCents, totalCents } = breakdown(payment.amount.cents);
    return this.invoices.record(actor, {
      paymentId: payment.id,
      subtotal: Money.ofCents(subtotalCents),
      vat: Money.ofCents(vatCents),
      total: Money.ofCents(totalCents),
      nit,
      receiptEmail: await this.contacts.contactOf(actor),
      createdAt: payment.createdAt,
    });
  }
}
