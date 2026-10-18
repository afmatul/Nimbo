import {
  billingHistoryResponseSchema,
  invoiceDownloadResponseSchema,
  subscriptionViewSchema,
} from './history';

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
const VIEW = {
  plan: TEAM,
  expiresAt: '2026-11-13T18:00:00.000Z',
  status: 'active',
  autoRenew: true,
  pendingPlan: null,
  nextCharge: {
    date: '2026-11-13T18:00:00.000Z',
    amountCents: 11_000,
    planName: 'Equipo',
    card: { brand: 'visa', last4: '4242' },
  },
  renewal: {
    available: true,
    unavailableReason: null,
    expectedExpiresAt: '2026-11-13T18:00:00.000Z',
    periodStartsAt: '2026-11-13T18:00:00.000Z',
    periodEndsAt: '2026-12-13T18:00:00.000Z',
    amountCents: 11_000,
    planName: 'Equipo',
  },
};
const HISTORY = {
  subscription: VIEW,
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

describe('subscriptionViewSchema (spec 010 §6, CA-25)', () => {
  it('CA-25: acepta Personal con todo lo de pago nulo', () => {
    const personal = {
      ...VIEW,
      plan: { ...TEAM, slug: 'personal', priceCents: 0 },
      expiresAt: null,
      pendingPlan: null,
      nextCharge: null,
      renewal: null,
    };

    expect(subscriptionViewSchema.safeParse(personal).success).toBe(true);
  });

  it('CA-28: acepta «Renovar ahora» no disponible por un cambio programado', () => {
    const pending = {
      ...VIEW,
      pendingPlan: TEAM,
      renewal: { ...VIEW.renewal, available: false, unavailableReason: 'PLAN_CHANGE_PENDING' },
    };

    expect(subscriptionViewSchema.safeParse(pending).success).toBe(true);
  });

  it('ADR-0031: es lista blanca: la referencia del instrumento no pasa', () => {
    const withRef = { ...VIEW, nextCharge: { ...VIEW.nextCharge, instrumentRef: 'SIM-TOK-ok-1' } };

    expect(subscriptionViewSchema.safeParse(withRef).success).toBe(false);
  });
});
