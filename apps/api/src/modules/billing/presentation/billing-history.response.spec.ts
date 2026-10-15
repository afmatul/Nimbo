import type { PaymentRecord } from '../application/ports/i-billing-history.reader.port';

import { toBillingHistoryResponse } from './billing-history.response';

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

describe('toBillingHistoryResponse (spec 009 CA-7)', () => {
  it('CA-7: fechas ISO, la factura con PDF es descargable y la clave del objeto no sale', () => {
    const response = toBillingHistoryResponse({
      subscription: { planName: 'Equipo', expiresAt: new Date('2026-11-13T18:00:00.000Z') },
      payments: [APPROVED],
    });

    expect(response).toEqual({
      subscription: { planName: 'Equipo', expiresAt: '2026-11-13T18:00:00.000Z' },
      payments: [
        {
          id: APPROVED.id,
          createdAt: '2026-10-14T18:00:00.000Z',
          reference: 'SIM-2026-000007',
          planName: 'Equipo',
          amountCents: 11_000,
          status: 'aprobada',
          invoice: {
            id: '22222222-2222-4222-8222-222222222222',
            number: 'NB-2026-0042',
            downloadable: true,
          },
        },
      ],
    });
    expect(JSON.stringify(response)).not.toContain('invoices/');
  });

  it('CA-7: factura sin PDF sin descarga, rechazo sin factura, Personal sin vencimiento y sin suscripción', () => {
    const withoutPdf = { ...APPROVED, invoice: { ...INVOICE, objectKey: null } };
    const rejected = { ...APPROVED, status: 'rechazada' as const, invoice: null };

    const response = toBillingHistoryResponse({
      subscription: { planName: 'Personal', expiresAt: null },
      payments: [withoutPdf, rejected],
    });

    expect(response.subscription).toEqual({ planName: 'Personal', expiresAt: null });
    expect(response.payments.map((payment) => payment.invoice?.downloadable ?? null)).toEqual([
      false,
      null,
    ]);
    expect(toBillingHistoryResponse({ subscription: null, payments: [] })).toEqual({
      subscription: null,
      payments: [],
    });
  });
});
