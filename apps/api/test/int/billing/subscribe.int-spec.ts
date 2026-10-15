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

const SUBSCRIBE = '/api/v1/billing/subscribe';
const ATTEMPTS_PER_WINDOW = 10;

/** Cuerpo válido de RN-9 con la tarjeta y el plan indicados. */
const body = (planSlug: string, number: string = TEST_CARDS.approved, expYear = 2030) => ({
  planSlug,
  card: { number, expMonth: 12, expYear, cvc: '123' },
  nit: 'CF',
});

/** Estado de la cuenta como lo ve el dueño de las tablas (sin RLS). */
interface AccountState {
  readonly plan: string | null;
  readonly expires: Date | null;
  readonly payments: string[];
}

/** `POST /billing/subscribe` de punta a punta (spec 009 CA-3 a CA-5, RN-8): Postgres y Redis reales, RLS forzado. */
describe('POST /api/v1/billing/subscribe (spec 009 CA-3 a CA-5)', () => {
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

  /** Una cuenta nueva sin fila de suscripción (como si el evento de verificación se hubiera perdido). */
  const newAccount = async (role: Role = Role.CLIENT) => {
    const id = await insertAccount(owner, role);
    accounts.push(id);
    const auth = {
      Authorization: `Bearer ${tokens.valid({ userId: id, role, sessionId: randomUUID() })}`,
    };
    const subscribe = (payload: unknown): Promise<Response> =>
      request(testApp.app.getHttpServer())
        .post(SUBSCRIBE)
        .set(auth)
        .send(payload as object);
    return { id, subscribe };
  };

  const stateOf = async (userId: string): Promise<AccountState> => {
    const [subscription] = (await owner.query(
      `SELECT p.slug, s.vence_en FROM suscripcion s JOIN plan p ON p.id = s.plan_id WHERE s.usuario_id = $1`,
      [userId],
    )) as { slug: string; vence_en: Date | null }[];
    const payments = (await owner.query(
      'SELECT estado FROM transaccion WHERE usuario_id = $1 ORDER BY creado_en',
      [userId],
    )) as { estado: string }[];
    return {
      plan: subscription?.slug ?? null,
      expires: subscription?.vence_en ?? null,
      payments: payments.map((row) => row.estado),
    };
  };

  it('CA-3: un cliente sin fila paga Equipo: transacción aprobada, suscripción de 30 días y referencia SIM', async () => {
    const ana = await newAccount();

    const response = await ana.subscribe(body('equipo'));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      reference: expect.stringMatching(/^SIM-\d{4}-\d{6,}$/) as unknown,
      plan: { slug: 'equipo', name: 'Equipo' },
      amounts: { subtotalCents: 9821, vatCents: 1179, totalCents: 11_000 },
    });
    const state = await stateOf(ana.id);
    expect(state).toMatchObject({ plan: 'equipo', payments: ['aprobada'] });
    expect(state.expires?.toISOString()).toBe((response.body as { expiresAt: string }).expiresAt);
  });

  it('CA-4: la tarjeta de rechazo es 402; la transacción rechazada queda y la cuenta sigue en Personal', async () => {
    const bruno = await newAccount();

    const response = await bruno.subscribe(body('equipo', TEST_CARDS.rejected));

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({ code: 'BILLING_PAYMENT_REJECTED' });
    await expect(stateOf(bruno.id)).resolves.toEqual({
      plan: 'personal',
      expires: null,
      payments: ['rechazada'],
    });
  });

  it.each(['no-existe', 'personal'])('CA-5: el plan «%s» es 400 sin transacción', async (slug) => {
    const carla = await newAccount();

    const response = await carla.subscribe(body(slug));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'BILLING_PLAN_NOT_AVAILABLE' });
    expect((await stateOf(carla.id)).payments).toEqual([]);
  });

  it('CA-5: con un plan de pago vigente, otro pago es 400 sin transacción (el cambio es de la 010)', async () => {
    const diego = await newAccount();
    await diego.subscribe(body('pro'));

    const response = await diego.subscribe(body('equipo'));

    expect(response.status).toBe(400);
    await expect(stateOf(diego.id)).resolves.toMatchObject({ plan: 'pro', payments: ['aprobada'] });
  });

  it.each([
    ['una tarjeta que no es de prueba', body('equipo', '5555555555554444'), 'card.number'],
    ['un NIT mal formado', { ...body('equipo'), nit: '12-3' }, 'nit'],
    ['una tarjeta vencida', body('equipo', TEST_CARDS.approved, 2020), 'card.expMonth'],
  ])('CA-5: %s es 422 con el campo y sin transacción', async (_case, payload, field) => {
    const elena = await newAccount();

    const response = await elena.subscribe(payload);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'BILLING_INVALID_INPUT' });
    expect(
      (response.body as { fields: { field: string }[] }).fields.map((issue) => issue.field),
    ).toContain(field);
    expect((await stateOf(elena.id)).payments).toEqual([]);
  });

  it('CA-5: el intento 11 en 15 minutos es 429 con `Retry-After` y sin transacción', async () => {
    const fabio = await newAccount();
    for (let attempt = 0; attempt < ATTEMPTS_PER_WINDOW; attempt += 1) {
      await fabio.subscribe(body('no-existe'));
    }

    const response = await fabio.subscribe(body('equipo'));

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: 'SHARED_TOO_MANY_REQUESTS' });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect((await stateOf(fabio.id)).payments).toEqual([]);
  });

  it('plan §5: un rol interno recibe 403 y no paga por un cliente', async () => {
    const support = await newAccount(Role.SUPPORT);

    const response = await support.subscribe(body('equipo'));

    expect(response.status).toBe(403);
  });

  it.each([
    ['sin fila de suscripción', false],
    ['con la fila Personal', true],
  ])(
    'plan §2: dos pagos simultáneos %s: solo uno se aprueba, el otro es 400',
    async (_case, withRow) => {
      const gabi = await newAccount();
      if (withRow) {
        await owner.query(
          `INSERT INTO suscripcion (usuario_id, plan_id) SELECT $1, id FROM plan WHERE slug = 'personal'`,
          [gabi.id],
        );
      }

      const statuses = (
        await Promise.all([gabi.subscribe(body('equipo')), gabi.subscribe(body('pro'))])
      ).map((response) => response.status);

      expect(statuses.sort()).toEqual([201, 400]);
      expect((await stateOf(gabi.id)).payments).toEqual(['aprobada']);
    },
  );
});
