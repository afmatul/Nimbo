import type { PaymentRecord } from '../application/ports/i-billing-history.reader.port';
import { aPlan } from '../application/testing/plans';

import { toBillingHistoryResponse } from './billing-history.response';

const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
});
const INVOICE = {
  id: '22222222-2222-4222-8222-222222222222',
  number: 'NB-2026-0042',
  objectKey: 'invoices/a/b.pdf',
};
const APPROVED: PaymentRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: new Date('2026-10-14T18:00:00.000Z'),
  reference: 'SIM-2026-000007',
  planName: 'Equipo',
  amountCents: 11_000,
  status: 'aprobada',
  invoice: INVOICE,
};
const EMPTY = { subscription: null, paymentMethod: null, receiptEmail: null, payments: [] };

describe('toBillingHistoryResponse (spec 009 CA-7)', () => {
  it('CA-7: el plan con el contrato del catálogo, la tarjeta, el correo y la factura descargable, sin la clave', () => {
    const response = toBillingHistoryResponse({
      subscription: { plan: TEAM, expiresAt: new Date('2026-11-13T18:00:00.000Z') },
      paymentMethod: { brand: 'visa', last4: '4242' },
      receiptEmail: 'ana@ejemplo.com',
      payments: [APPROVED],
    });

    expect(response.subscription).toEqual({
      plan: expect.objectContaining({
        slug: 'equipo',
        priceCents: 11_000,
        quotaBytes: '16106127360',
      }) as unknown,
      expiresAt: '2026-11-13T18:00:00.000Z',
    });
    expect(response.paymentMethod).toEqual({ brand: 'visa', last4: '4242' });
    expect(response.receiptEmail).toBe('ana@ejemplo.com');
    expect(response.payments).toEqual([
      {
        id: APPROVED.id,
        createdAt: '2026-10-14T18:00:00.000Z',
        reference: 'SIM-2026-000007',
        planName: 'Equipo',
        amountCents: 11_000,
        status: 'aprobada',
        invoice: { id: INVOICE.id, number: 'NB-2026-0042', downloadable: true },
      },
    ]);
    expect(JSON.stringify(response)).not.toContain('invoices/');
  });

  it('CA-7: factura sin PDF sin descarga, rechazo sin factura, Personal sin vencimiento y sin suscripción', () => {
    const withoutPdf = { ...APPROVED, invoice: { ...INVOICE, objectKey: null } };
    const rejected = { ...APPROVED, status: 'rechazada' as const, invoice: null };

    const response = toBillingHistoryResponse({
      ...EMPTY,
      subscription: { plan: aPlan({}), expiresAt: null },
      payments: [withoutPdf, rejected],
    });

    expect(response.subscription?.expiresAt).toBeNull();
    expect(response.payments.map((payment) => payment.invoice?.downloadable ?? null)).toEqual([
      false,
      null,
    ]);
    expect(toBillingHistoryResponse(EMPTY)).toEqual(EMPTY);
  });
});
