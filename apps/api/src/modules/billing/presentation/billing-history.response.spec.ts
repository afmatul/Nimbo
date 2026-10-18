import type { PaymentRecord } from '../application/ports/i-billing-history.reader.port';
import type { SubscriptionSummary } from '../application/subscription-summary';
import { aPlan } from '../application/testing/plans';
import type { Plan } from '../domain/entities/plan.entity';

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
/** Lo que la 009 mostraba; el resto de la vista lo prueba `subscription-view.response.spec.ts` (010). */
const summaryOf = (plan: Plan, expiresAt: Date | null): SubscriptionSummary => ({
  plan,
  expiresAt,
  standing: 'active',
  autoRenew: true,
  pendingPlan: null,
  nextCharge: null,
  renewal: null,
});
const EMPTY = { subscription: null, paymentMethod: null, billingDetails: null, payments: [] };

describe('toBillingHistoryResponse (spec 009 CA-7)', () => {
  it('CA-7: el plan con el contrato del catálogo, la tarjeta, el correo y la factura descargable, sin la clave', () => {
    const response = toBillingHistoryResponse({
      subscription: summaryOf(TEAM, new Date('2026-11-13T18:00:00.000Z')),
      paymentMethod: { brand: 'visa', last4: '4242' },
      billingDetails: { nit: '12345678', receiptEmail: 'ana@ejemplo.com' },
      payments: [APPROVED],
    });

    expect(response.subscription).toMatchObject({
      plan: expect.objectContaining({
        slug: 'equipo',
        priceCents: 11_000,
        quotaBytes: '16106127360',
      }) as unknown,
      expiresAt: '2026-11-13T18:00:00.000Z',
    });
    expect(response.paymentMethod).toEqual({ brand: 'visa', last4: '4242' });
    expect(response.billingDetails).toEqual({ nit: '12345678', receiptEmail: 'ana@ejemplo.com' });
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
      subscription: summaryOf(aPlan({}), null),
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
