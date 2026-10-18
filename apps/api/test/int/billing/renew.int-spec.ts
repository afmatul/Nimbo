import { randomUUID } from 'node:crypto';

import { TEST_CARDS } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { FixedClock, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import type { TestApp } from '../setup/test-app';
import { insertAccount } from '../storage/storage-test-db';

import { createBillingHttpApp } from './billing-http';
import { removeBillingAccounts } from './billing-test-db';

const RENEW = '/api/v1/billing/renew';
const PERSONAL_ID = '10000000-0000-4000-8000-000000000001';
const PRO_ID = '10000000-0000-4000-8000-000000000002';
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const DAY_MS = 86_400_000;
const PERIOD_MS = 30 * DAY_MS;

const body = (expectedExpiresAt: Date, number: string = TEST_CARDS.approved) => ({
  card: { number, expMonth: 12, expYear: 2030, cvc: '123' },
  nit: 'CF',
  expectedExpiresAt: expectedExpiresAt.toISOString(),
});

/** La suscripción que se le arma a la cuenta, como dueño de las tablas. */
interface PaidRow {
  readonly expiresAt: Date;
  readonly readOnly?: boolean;
  readonly pendingPlanId?: string;
}

interface SubscriptionRow {
  readonly plan_id: string;
  readonly iniciado_en: Date;
  readonly vence_en: Date | null;
  readonly estado: string;
  readonly plan_pendiente_id: string | null;
}

/** `POST /billing/renew` de punta a punta (spec 010 CA-8 a CA-11, CA-20, CA-26, CA-28): Postgres y Redis reales. */
describe('POST /api/v1/billing/renew (spec 010 CA-8 a CA-11, CA-26, CA-28)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));
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

  const newAccount = async (paid: PaidRow | null) => {
    const id = await insertAccount(owner);
    accounts.push(id);
    await owner.query(
      `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en, estado, plan_pendiente_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      paid === null
        ? [id, PERSONAL_ID, new Date(), null, 'vigente', null]
        : [
            id,
            TEAM_ID,
            new Date(paid.expiresAt.getTime() - PERIOD_MS),
            paid.expiresAt,
            paid.readOnly === true ? 'solo_lectura' : 'vigente',
            paid.pendingPlanId ?? null,
          ],
    );
    const auth = {
      Authorization: `Bearer ${tokens.valid({ userId: id, role: Role.CLIENT, sessionId: randomUUID() })}`,
    };
    const renew = (payload: unknown): Promise<Response> =>
      request(testApp.app.getHttpServer())
        .post(RENEW)
        .set(auth)
        .send(payload as object);
    return { id, renew };
  };

  const subscriptionOf = async (userId: string): Promise<SubscriptionRow> => {
    const [row] = (await owner.query(
      `SELECT plan_id, iniciado_en, vence_en, estado, plan_pendiente_id FROM suscripcion
        WHERE usuario_id = $1`,
      [userId],
    )) as SubscriptionRow[];
    if (row === undefined) throw new Error('sin suscripción');
    return row;
  };

  const countOf = async (table: 'transaccion' | 'factura', userId: string): Promise<number> => {
    const [row] = (await owner.query(
      `SELECT count(*)::int AS total FROM ${table} WHERE usuario_id = $1`,
      [userId],
    )) as { total: number }[];
    return row?.total ?? 0;
  };

  const auditsOf = async (userId: string): Promise<{ accion: string; atributos: object }[]> =>
    (await owner.query(
      `SELECT accion, atributos FROM evento_auditoria
        WHERE usuario_afectado_id = $1 AND accion LIKE 'subscription.%' ORDER BY ocurrido_en, id`,
      [userId],
    )) as { accion: string; atributos: object }[];

  const inDays = (days: number): Date => new Date(Date.now() + days * DAY_MS);

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
    await expect(subscriptionOf(ana.id)).resolves.toMatchObject({
      iniciado_en: expiresAt,
      vence_en: next,
      estado: 'vigente',
    });
    expect(await countOf('factura', ana.id)).toBe(1);
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
    await expect(subscriptionOf(bruno.id)).resolves.toMatchObject({
      vence_en: expiresAt,
      estado: 'vigente',
    });
    expect(await countOf('transaccion', bruno.id)).toBe(1);
    expect(await countOf('factura', bruno.id)).toBe(0);
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
    const row = await subscriptionOf(carla.id);
    expect(row).toMatchObject({ plan_id: PRO_ID, estado: 'vigente', plan_pendiente_id: null });
    expect(row.iniciado_en.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.vence_en?.getTime()).toBe(row.iniciado_en.getTime() + PERIOD_MS);
    await expect(auditsOf(carla.id)).resolves.toMatchObject([
      { accion: 'subscription.renewed', atributos: { planSlug: 'pro' } },
      { accion: 'subscription.read_only_exited' },
      { accion: 'subscription.plan_change_applied', atributos: { planSlug: 'pro' } },
    ]);
  });

  it('CA-11: en Personal es 400 BILLING_NO_PAID_SUBSCRIPTION y no se cobra', async () => {
    const dana = await newAccount(null);

    const response = await dana.renew(body(inDays(3)));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'BILLING_NO_PAID_SUBSCRIPTION' });
    expect(await countOf('transaccion', dana.id)).toBe(0);
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
    expect(await countOf('transaccion', elena.id)).toBe(1);
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
      expect(await countOf('transaccion', fabio.id)).toBe(0);
      await expect(subscriptionOf(fabio.id)).resolves.toMatchObject({ plan_pendiente_id: planId });
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
