import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { AccountContactReader } from '../../identity';
import type { InvoiceDraft } from '../domain/entities/invoice.entity';
import type { Payment } from '../domain/entities/payment.entity';
import { Money } from '../domain/value-objects/money';

import { InvoiceService } from './invoice.service';
import type { IInvoiceRepository } from './ports/i-invoice-repository.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const PAID_AT = new Date('2026-10-14T12:00:00.000Z');
const PAYMENT: Payment = {
  id: 'pago-1',
  userId: ANA.id,
  planId: '10000000-0000-4000-8000-000000000003',
  amount: Money.ofCents(11_000),
  status: 'aprobada',
  cardBrand: 'visa',
  cardLast4: '4242',
  reference: 'SIM-2026-000001',
  createdAt: PAID_AT,
};

const setup = () => {
  const drafts: InvoiceDraft[] = [];
  const invoices: IInvoiceRepository = {
    record: jest.fn((_actor: Actor, draft: InvoiceDraft) => {
      drafts.push(draft);
      return Promise.resolve({ ...draft, id: 'factura-1', userId: ANA.id, number: 'NB-2026-0001' });
    }),
    findForIssue: jest.fn(),
    markStored: jest.fn(),
    markNoticeQueued: jest.fn(),
  };
  const contacts = {
    contactOf: jest.fn().mockResolvedValue('ana@ejemplo.com'),
  } as unknown as AccountContactReader;
  return { service: new InvoiceService(invoices, contacts), drafts };
};

describe('InvoiceService.register (spec 009 CA-6, RN-2; plan §2, I-10)', () => {
  it('CA-6, RN-2: registra la factura del pago con el desglose de IVA, el NIT y el correo del comprobante', async () => {
    const { service, drafts } = setup();

    const invoice = await service.register(ANA, PAYMENT, '12345678');

    expect(drafts).toEqual([
      {
        paymentId: 'pago-1',
        subtotal: Money.ofCents(9821),
        vat: Money.ofCents(1179),
        total: Money.ofCents(11_000),
        nit: '12345678',
        receiptEmail: 'ana@ejemplo.com',
        createdAt: PAID_AT,
      },
    ]);
    expect(invoice.number).toBe('NB-2026-0001');
  });

  it('CA-6: un pago rechazado no se factura', async () => {
    const { service } = setup();

    await expect(
      service.register(ANA, { ...PAYMENT, status: 'rechazada' }, 'CF'),
    ).rejects.toThrow();
  });
});
