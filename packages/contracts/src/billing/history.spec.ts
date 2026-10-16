import { billingHistoryResponseSchema, invoiceDownloadResponseSchema } from './history';

const TEAM = {
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  description: 'Para equipos',
  priceCents: 11_000,
  quotaBytes: '375809638400',
  maxFileBytes: '1073741824',
  maxEditors: 5,
  agentQueriesPerMonth: 2000,
  retainedVersions: 60,
  trashRetentionDays: 60,
};
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
const HISTORY = {
  subscription: { plan: TEAM, expiresAt: '2026-11-13T18:00:00.000Z' },
  paymentMethod: { brand: 'visa', last4: '4242' },
  billingDetails: { nit: '12345678', receiptEmail: 'ana@ejemplo.com' },
  payments: [PAYMENT],
};

describe('billingHistoryResponseSchema (spec 009 CA-7)', () => {
  it('CA-7: acepta el plan actual con el esquema del catálogo, la tarjeta, NIT y correo, y un pago con factura', () => {
    expect(billingHistoryResponseSchema.parse(HISTORY)).toEqual(HISTORY);
  });

  it('CA-7: acepta el historial vacío y un rechazo sin factura', () => {
    const empty = { subscription: null, paymentMethod: null, billingDetails: null, payments: [] };
    const rejected = { ...HISTORY, payments: [{ ...PAYMENT, status: 'rechazada', invoice: null }] };

    expect(billingHistoryResponseSchema.safeParse(empty).success).toBe(true);
    expect(billingHistoryResponseSchema.safeParse(rejected).success).toBe(true);
  });

  it('RNF-05, RN-9: es lista blanca: ni la clave del objeto ni el número de tarjeta pasan', () => {
    const withKey = {
      ...HISTORY,
      payments: [{ ...PAYMENT, invoice: { ...PAYMENT.invoice, objectKey: 'invoices/x/y.pdf' } }],
    };
    const withCard = {
      ...HISTORY,
      paymentMethod: { brand: 'visa', last4: '4242', number: '4242424242424242' },
    };

    expect(billingHistoryResponseSchema.safeParse(withKey).success).toBe(false);
    expect(billingHistoryResponseSchema.safeParse(withCard).success).toBe(false);
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
