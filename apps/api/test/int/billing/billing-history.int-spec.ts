import { randomUUID } from 'node:crypto';

import { billingHistoryResponseSchema, TEST_CARDS } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import { FixedClock, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import type { TestApp } from '../setup/test-app';
import { insertAccount } from '../storage/storage-test-db';

import { createBillingHttpApp } from './billing-http';
import { removeBillingAccounts } from './billing-test-db';

/** Historial y descarga de facturas de punta a punta (spec 009 CA-7, CA-8). */
describe('historial y descarga de facturas (spec 009 CA-7, CA-8)', () => {
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

  const tokenOf = (userId: string, role = Role.CLIENT): string =>
    tokens.valid({ userId, role, sessionId: randomUUID() });
  const newAccount = async (role = Role.CLIENT): Promise<string> => {
    const id = await insertAccount(owner, role);
    accounts.push(id);
    return id;
  };
  const http = () => request(testApp.app.getHttpServer());
  const subscribe = (userId: string, number: string) =>
    http()
      .post('/api/v1/billing/subscribe')
      .set({ Authorization: `Bearer ${tokenOf(userId)}` })
      .send({
        planSlug: 'equipo',
        card: { number, expMonth: 12, expYear: 2030, cvc: '123' },
        nit: 'CF',
      });
  const historyOf = (userId: string, role = Role.CLIENT) =>
    http()
      .get('/api/v1/billing/history')
      .set({ Authorization: `Bearer ${tokenOf(userId, role)}` });
  const download = (userId: string, invoiceId: string) =>
    http()
      .get(`/api/v1/billing/invoices/${invoiceId}/download`)
      .set({ Authorization: `Bearer ${tokenOf(userId)}` });

  it('CA-7: sin pagos, el historial está vacío', async () => {
    const ana = await newAccount();

    const response = await historyOf(ana);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      subscription: null,
      paymentMethod: null,
      receiptEmail: null,
      payments: [],
    });
  });

  it('CA-7: muestra el plan actual (catálogo), la tarjeta del pago aprobado, el correo y los pagos del más reciente al más antiguo, con su factura si se aprobó', async () => {
    const bruno = await newAccount();
    await subscribe(bruno, TEST_CARDS.rejected);
    await subscribe(bruno, TEST_CARDS.approved);

    const response = await historyOf(bruno);
    const history = billingHistoryResponseSchema.parse(response.body);

    expect(history.subscription).toEqual({
      plan: expect.objectContaining({
        slug: 'equipo',
        name: 'Equipo',
        priceCents: 11_000,
      }) as unknown,
      expiresAt: expect.any(String) as unknown,
    });
    expect(history.paymentMethod).toEqual({ brand: expect.any(String) as unknown, last4: '4242' });
    expect(history.receiptEmail).toBe(`storage.${bruno}@ejemplo.com`);
    expect(
      history.payments.map((payment) => [payment.status, payment.planName, payment.amountCents]),
    ).toEqual([
      ['aprobada', 'Equipo', 11_000],
      ['rechazada', 'Equipo', 11_000],
    ]);
    expect(history.payments[0]?.reference).toMatch(/^SIM-/);
    expect(history.payments[0]?.invoice).toMatchObject({
      number: expect.stringMatching(/^NB-/) as unknown,
      downloadable: true,
    });
    expect(history.payments[1]?.invoice).toBeNull();
  });

  it('CA-8: el dueño recibe un enlace de 5 minutos al PDF', async () => {
    const carla = await newAccount();
    await subscribe(carla, TEST_CARDS.approved);
    const [payment] = billingHistoryResponseSchema.parse((await historyOf(carla)).body).payments;

    const response = await download(carla, payment?.invoice?.id ?? '');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      downloadUrl: expect.any(String) as unknown,
      expiresInSeconds: 300,
    });
    expect(new URL(response.body.downloadUrl as string).searchParams.get('X-Amz-Expires')).toBe(
      '300',
    );
  });

  it('CA-7, CA-8: una factura sin PDF se lista sin descarga y pedirla es 404', async () => {
    const dana = await newAccount();
    await subscribe(dana, TEST_CARDS.approved);
    await owner.query('UPDATE factura SET clave_objeto = NULL WHERE usuario_id = $1', [dana]);

    const [payment] = billingHistoryResponseSchema.parse((await historyOf(dana)).body).payments;
    const response = await download(dana, payment?.invoice?.id ?? '');

    expect(payment?.invoice?.downloadable).toBe(false);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'BILLING_INVOICE_NOT_FOUND' });
  });

  it.each([
    ['inexistente', () => randomUUID()],
    ['malformado', () => 'no-es-un-uuid'],
  ])('CA-8: un id %s es el mismo 404', async (_case, invoiceId) => {
    const eva = await newAccount();

    const response = await download(eva, invoiceId());

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'BILLING_INVOICE_NOT_FOUND' });
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'RNF-05: un %s no tiene historial (403)',
    async (role) => {
      const internal = await newAccount(role);

      const response = await historyOf(internal, role);

      expect(response.status).toBe(403);
    },
  );
});
