import { TEST_CARDS } from '@nimbo/contracts';
import type { DataSource } from 'typeorm';

import { connectAsOwner } from '../../support/database-urls';
import type { TestApp } from '../setup/test-app';

import { createBillingHttpApp } from './billing-http';
import { removeBillingAccounts } from './billing-test-db';
import {
  countOf,
  inDays,
  PERIOD_MS,
  PERSONAL_ID,
  PRO_ID,
  subscriptionAccounts,
  subscriptionAuditsOf,
  subscriptionOf,
} from './subscription-accounts';
import type { PaidRow } from './subscription-accounts';

const body = (expectedExpiresAt: Date, number: string = TEST_CARDS.approved) => ({
  card: { number, expMonth: 12, expYear: 2030, cvc: '123' },
  nit: 'CF',
  expectedExpiresAt: expectedExpiresAt.toISOString(),
});

/** `POST /billing/renew` de punta a punta (spec 010 CA-8 a CA-11, CA-20, CA-26, CA-28): Postgres y Redis reales. */
describe('POST /api/v1/billing/renew (spec 010 CA-8 a CA-11, CA-26, CA-28)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  const accounts: string[] = [];

  beforeAll(async () => {
    testApp = await createBillingHttpApp();
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await removeBillingAccounts(owner, accounts);
    await owner?.destroy();
    await testApp?.close();
  });

  const accountWith = subscriptionAccounts(
    () => testApp,
    () => owner,
    accounts,
  );
  const newAccount = async (paid: PaidRow | null) => {
    const account = await accountWith(paid);
    return { id: account.id, renew: (payload: object) => account.call('post', 'renew', payload) };
  };
  const subscriptionRow = (userId: string) => subscriptionOf(owner, userId);
  const auditsOf = (userId: string) => subscriptionAuditsOf(owner, userId);
  const counted = (table: 'transaccion' | 'factura', userId: string) =>
    countOf(owner, table, userId);

  it('CA-8, RN-1: pagada antes de vencer, el periodo nuevo empieza en el `vence_en` vigente', async () => {
    const expiresAt = inDays(3);
    const ana = await newAccount({ expiresAt });

    const response = await ana.renew(body(expiresAt));

    expect(response.status).toBe(201);
    const next = new Date(expiresAt.getTime() + PERIOD_MS);
    expect(response.body).toMatchObject({
      plan: { slug: 'equipo' },
      expiresAt: next.toISOString(),
      amounts: { totalCents: 11_000 },
    });
    await expect(subscriptionRow(ana.id)).resolves.toMatchObject({
      iniciado_en: expiresAt,
      vence_en: next,
      estado: 'vigente',
    });
    expect(await counted('factura', ana.id)).toBe(1);
    await expect(auditsOf(ana.id)).resolves.toEqual([
      {
        accion: 'subscription.renewed',
        atributos: { trigger: 'manual', planSlug: 'equipo', amountCents: 11_000 },
      },
    ]);
  });

  it('CA-9: con la tarjeta de rechazo es 402; queda la transacción rechazada y no cambia la suscripción', async () => {
    const expiresAt = inDays(2);
    const bruno = await newAccount({ expiresAt });

    const response = await bruno.renew(body(expiresAt, TEST_CARDS.rejected));

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({ code: 'BILLING_PAYMENT_REJECTED' });
    await expect(subscriptionRow(bruno.id)).resolves.toMatchObject({
      vence_en: expiresAt,
      estado: 'vigente',
    });
    expect(await counted('transaccion', bruno.id)).toBe(1);
    expect(await counted('factura', bruno.id)).toBe(0);
    await expect(auditsOf(bruno.id)).resolves.toMatchObject([
      { accion: 'subscription.renewal_rejected' },
    ]);
  });

  it('CA-10, CA-20: desde solo lectura empieza al pagar, aplica el cambio a Pro y sale de solo lectura', async () => {
    const expiresAt = inDays(-2);
    const carla = await newAccount({ expiresAt, readOnly: true, pendingPlanId: PRO_ID });
    const before = Date.now();

    const response = await carla.renew(body(expiresAt));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ plan: { slug: 'pro' } });
    const row = await subscriptionRow(carla.id);
    expect(row).toMatchObject({ plan_id: PRO_ID, estado: 'vigente', plan_pendiente_id: null });
    expect(row.iniciado_en.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.vence_en?.getTime()).toBe(row.iniciado_en.getTime() + PERIOD_MS);
    // Los tres eventos son de la misma transacción: comparten `ocurrido_en` y su orden no está definido.
    const audits = await auditsOf(carla.id);
    expect(audits).toHaveLength(3);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accion: 'subscription.renewed',
          atributos: expect.objectContaining({ planSlug: 'pro' }),
        }),
        expect.objectContaining({ accion: 'subscription.read_only_exited' }),
        { accion: 'subscription.plan_change_applied', atributos: { planSlug: 'pro' } },
      ]),
    );
  });

  it('CA-11: en Personal es 400 BILLING_NO_PAID_SUBSCRIPTION y no se cobra', async () => {
    const dana = await newAccount(null);

    const response = await dana.renew(body(inDays(3)));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'BILLING_NO_PAID_SUBSCRIPTION' });
    expect(await counted('transaccion', dana.id)).toBe(0);
  });

  it('CA-26, RN-9: ya pagado por adelantado, o con un `vence_en` viejo, es 409 sin otro cobro', async () => {
    const expiresAt = inDays(3);
    const elena = await newAccount({ expiresAt });
    const first = await elena.renew(body(expiresAt));
    const renewedTo = new Date((first.body as { expiresAt: string }).expiresAt);

    const stale = await elena.renew(body(expiresAt));
    const ahead = await elena.renew(body(renewedTo));

    for (const response of [stale, ahead]) {
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'BILLING_ALREADY_RENEWED' });
    }
    expect(await counted('transaccion', elena.id)).toBe(1);
  });

  it.each([
    ['a otro plan de pago', PRO_ID],
    ['a Personal', PERSONAL_ID],
  ])(
    'CA-28: con un cambio programado %s es 409 BILLING_PLAN_CHANGE_PENDING',
    async (_case, planId) => {
      const expiresAt = inDays(3);
      const fabio = await newAccount({ expiresAt, pendingPlanId: planId });

      const response = await fabio.renew(body(expiresAt));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'BILLING_PLAN_CHANGE_PENDING' });
      expect(await counted('transaccion', fabio.id)).toBe(0);
      await expect(subscriptionRow(fabio.id)).resolves.toMatchObject({ plan_pendiente_id: planId });
    },
  );

  it('RN-9: sin `expectedExpiresAt` es 422 con el campo', async () => {
    const gabriel = await newAccount({ expiresAt: inDays(3) });
    const { expectedExpiresAt: _omitted, ...withoutDate } = body(inDays(3));

    const response = await gabriel.renew(withoutDate);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'BILLING_INVALID_INPUT' });
  });
});
