import type { IssuableInvoice } from './ports/i-invoice-repository.port';
import { receiptMessage } from './receipt-message';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const INVOICE: IssuableInvoice = {
  id: '22222222-2222-4222-8222-222222222222',
  paymentId: '33333333-3333-4333-8333-333333333333',
  objectKey: 'invoices/x/y.pdf',
  noticeQueuedAt: null,
  document: {
    number: 'NB-2026-0042',
    issuedAt: new Date('2026-10-14T18:00:00.000Z'),
    planName: 'Equipo <Plus>',
    paymentReference: 'SIM-2026-000007',
    subtotalCents: 9821,
    vatCents: 1179,
    totalCents: 11_000,
    nit: 'CF',
    receiptEmail: 'ana@ejemplo.com',
  },
};

describe('receiptMessage (spec 009 CA-6; decisión 4)', () => {
  it('CA-6: va al correo del comprobante con la clave `billing.receipt.<transacción>` (sin `:`)', () => {
    expect(receiptMessage(INVOICE, USER_ID)).toMatchObject({
      to: 'ana@ejemplo.com',
      idempotencyKey: 'billing.receipt.33333333-3333-4333-8333-333333333333',
      tag: 'billing.receipt',
      recipientId: USER_ID,
      subject: 'Tu comprobante de pago NB-2026-0042',
    });
  });

  it('CA-6: el texto trae el plan, la referencia y el total; el HTML escapa los datos', () => {
    const message = receiptMessage(INVOICE, USER_ID);

    for (const expected of ['Equipo <Plus>', 'SIM-2026-000007', 'Q110.00', 'NB-2026-0042']) {
      expect(message.text).toContain(expected);
    }
    expect(message.html).toContain('Equipo &lt;Plus&gt;');
    expect(message.html).not.toContain('<Plus>');
  });
});
