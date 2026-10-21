import { TEST_CARDS } from '@nimbo/contracts';
import type { DataSource } from 'typeorm';

import { connectAsOwner } from '../../support/database-urls';
import type { TestApp } from '../setup/test-app';

import { createBillingHttpApp } from './billing-http';
import { removeBillingAccounts } from './billing-test-db';
import {
  inDays,
  insertRetiredPlan,
  PERSONAL_ID,
  PRO_ID,
  removeRetiredPlan,
  subscriptionAccounts,
  subscriptionAuditsOf,
  subscriptionOf,
  TEAM_ID,
} from './subscription-accounts';

/**
 * Ajustes y vista de la suscripción de punta a punta (spec 010 CA-6, CA-16 a CA-19, CA-22, CA-25, CA-27): Postgres y
 * Redis reales, RLS forzado, auditoría en la misma transacción.
 */
describe('ajustes de la suscripción y su vista (spec 010 CA-6, CA-16 a CA-19, CA-25, CA-27)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  const accounts: string[] = [];
  const accountWith = subscriptionAccounts(
    () => testApp,
    () => owner,
    accounts,
  );

  beforeAll(async () => {
    testApp = await createBillingHttpApp();
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await removeBillingAccounts(owner, accounts);
    await owner?.destroy();
    await testApp?.close();
  });

  it('CA-6: apaga y enciende la renovación automática sin tocar el periodo, con auditoría', async () => {
    const expiresAt = inDays(10);
    const ana = await accountWith({ expiresAt });

    const off = await ana.call('put', 'subscription/auto-renew', { enabled: false });
    const on = await ana.call('put', 'subscription/auto-renew', { enabled: true });

    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ autoRenew: false, nextCharge: null, status: 'active' });
    expect(on.body).toMatchObject({ autoRenew: true, nextCharge: { amountCents: 11_000 } });
    await expect(subscriptionOf(owner, ana.id)).resolves.toMatchObject({ vence_en: expiresAt });
    await expect(subscriptionAuditsOf(owner, ana.id)).resolves.toEqual([
      { accion: 'subscription.auto_renew_changed', atributos: { enabled: false } },
      { accion: 'subscription.auto_renew_changed', atributos: { enabled: true } },
    ]);
  });

  it('CA-6, CA-18: con Personal es 400 BILLING_NO_PAID_SUBSCRIPTION y no audita', async () => {
    const bruno = await accountWith(null);

    const autoRenew = await bruno.call('put', 'subscription/auto-renew', { enabled: false });
    const change = await bruno.call('put', 'subscription/plan-change', { planSlug: 'pro' });

    for (const response of [autoRenew, change]) {
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'BILLING_NO_PAID_SUBSCRIPTION' });
    }
    await expect(subscriptionAuditsOf(owner, bruno.id)).resolves.toEqual([]);
  });

  it('CA-16, CA-19, CA-22: programa Pro, se ve en la vista y se cancela, con auditoría', async () => {
    const carla = await accountWith({ expiresAt: inDays(10) });

    const scheduled = await carla.call('put', 'subscription/plan-change', { planSlug: 'pro' });

    expect(scheduled.status).toBe(200);
    expect(scheduled.body).toMatchObject({
      plan: { slug: 'equipo' },
      pendingPlan: { slug: 'pro' },
      pendingPlanDiscarded: false,
      nextCharge: { planName: 'Pro' },
      renewal: { available: false, unavailableReason: 'PLAN_CHANGE_PENDING' },
    });
    await expect(subscriptionOf(owner, carla.id)).resolves.toMatchObject({
      plan_id: TEAM_ID,
      plan_pendiente_id: PRO_ID,
    });

    const cancelled = await carla.call('delete', 'subscription/plan-change');
    const again = await carla.call('delete', 'subscription/plan-change');

    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ pendingPlan: null, renewal: { available: true } });
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ code: 'BILLING_NO_PENDING_PLAN_CHANGE' });
    await expect(subscriptionAuditsOf(owner, carla.id)).resolves.toEqual([
      { accion: 'subscription.plan_change_scheduled', atributos: { planSlug: 'pro' } },
      { accion: 'subscription.plan_change_cancelled', atributos: {} },
    ]);
  });

  it.each(['no-existe', 'equipo'])(
    'CA-17: «%s» es 400 BILLING_PLAN_CHANGE_INVALID y nada cambia',
    async (planSlug) => {
      const dana = await accountWith({ expiresAt: inDays(10) });

      const response = await dana.call('put', 'subscription/plan-change', { planSlug });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'BILLING_PLAN_CHANGE_INVALID' });
      await expect(subscriptionOf(owner, dana.id)).resolves.toMatchObject({
        plan_pendiente_id: null,
      });
    },
  );

  it('CA-29, CA-25: con el plan programado desactivado, la vista cobra el plan actual', async () => {
    const julia = await accountWith({ expiresAt: inDays(10) });
    const retired = await insertRetiredPlan(owner);
    await owner.query('UPDATE suscripcion SET plan_pendiente_id = $2 WHERE usuario_id = $1', [
      julia.id,
      retired.id,
    ]);

    const history = await julia.call('get', 'history');

    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({
      subscription: {
        pendingPlanDiscarded: true,
        nextCharge: { planName: 'Equipo', amountCents: 11_000 },
      },
    });
    await removeRetiredPlan(owner, retired.id);
  });

  it('CA-27: en solo lectura, la bajada a Personal se aplica ya y termina la solo lectura', async () => {
    const elena = await accountWith({ expiresAt: inDays(-2), readOnly: true });

    const response = await elena.call('put', 'subscription/plan-change', { planSlug: 'personal' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      plan: { slug: 'personal' },
      expiresAt: null,
      status: 'active',
      renewal: null,
    });
    await expect(subscriptionOf(owner, elena.id)).resolves.toMatchObject({
      plan_id: PERSONAL_ID,
      estado: 'vigente',
      vence_en: null,
    });
  });

  it('CA-25: el historial trae «Próximo cobro» con marca y últimos 4, y la renovación con su periodo', async () => {
    const expiresAt = inDays(2);
    const fabio = await accountWith({ expiresAt });
    await fabio.call('post', 'renew', {
      card: { number: TEST_CARDS.approved, expMonth: 12, expYear: 2030, cvc: '123' },
      nit: 'CF',
      expectedExpiresAt: expiresAt.toISOString(),
    });

    const history = await fabio.call('get', 'history');

    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({
      subscription: {
        status: 'active',
        nextCharge: {
          amountCents: 11_000,
          planName: 'Equipo',
          card: { brand: 'visa', last4: '4242' },
        },
        renewal: { available: false, unavailableReason: 'ALREADY_RENEWED' },
      },
    });
    expect(JSON.stringify(history.body)).not.toContain('SIM-TOK');
  });

  it('RN-8: a 2 días de vencer, la vista dice «por vencer»', async () => {
    const gabriel = await accountWith({ expiresAt: inDays(2) });

    const history = await gabriel.call('get', 'history');

    expect(history.body).toMatchObject({ subscription: { status: 'expiring' } });
  });
});
