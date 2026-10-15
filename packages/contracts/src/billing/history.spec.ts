import { billingHistoryResponseSchema, invoiceDownloadResponseSchema } from './history';

const PAYMENT = {
  id: '11111111-1111-4111-8111-111111111111',
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
};

describe('billingHistoryResponseSchema (spec 009 CA-7)', () => {
  it('CA-7: acepta el plan actual y un pago aprobado con su factura', () => {
    const history = {
      subscription: { planName: 'Equipo', expiresAt: '2026-11-13T18:00:00.000Z' },
      payments: [PAYMENT],
    };

    expect(billingHistoryResponseSchema.parse(history)).toEqual(history);
  });

  it('CA-7: acepta el historial vacío, Personal sin vencimiento y un rechazo sin factura', () => {
    const history = {
      subscription: { planName: 'Personal', expiresAt: null },
      payments: [{ ...PAYMENT, status: 'rechazada', invoice: null }],
    };

    expect(billingHistoryResponseSchema.safeParse(history).success).toBe(true);
    expect(
      billingHistoryResponseSchema.safeParse({ subscription: null, payments: [] }).success,
    ).toBe(true);
  });

  it('RNF-05: es lista blanca: un campo de más (p. ej. la clave del objeto) se rechaza', () => {
    const history = {
      subscription: null,
      payments: [{ ...PAYMENT, invoice: { ...PAYMENT.invoice, objectKey: 'invoices/x/y.pdf' } }],
    };

    expect(billingHistoryResponseSchema.safeParse(history).success).toBe(false);
  });
});

describe('invoiceDownloadResponseSchema (spec 009 CA-8)', () => {
  it('CA-8: un enlace y su vigencia en segundos', () => {
    const download = {
      downloadUrl: 'https://minio.local/x?X-Amz-Expires=300',
      expiresInSeconds: 300,
    };

    expect(invoiceDownloadResponseSchema.parse(download)).toEqual(download);
  });
});
