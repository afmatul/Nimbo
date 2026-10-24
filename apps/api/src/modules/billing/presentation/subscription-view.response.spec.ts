import type { SubscriptionSummary } from '../application/subscription-summary';
import { aPlan } from '../application/testing/plans';

import { toSubscriptionView } from './subscription-view.response';

const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
});
const PRO = aPlan({
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  priceCents: 25_000,
});
const EXPIRES = new Date('2026-11-13T12:00:00.000Z');
const NEXT_END = new Date('2026-12-13T12:00:00.000Z');

const SUMMARY: SubscriptionSummary = {
  plan: TEAM,
  expiresAt: EXPIRES,
  standing: 'expiring',
  autoRenew: true,
  pendingPlan: PRO,
  pendingPlanDiscarded: false,
  nextCharge: { date: EXPIRES, plan: PRO, card: { brand: 'visa', last4: '4242' } },
  renewal: {
    available: false,
    unavailableReason: 'PLAN_CHANGE_PENDING',
    periodStartsAt: EXPIRES,
    periodEndsAt: NEXT_END,
    plan: PRO,
    expectedExpiresAt: EXPIRES,
  },
};

describe('toSubscriptionView (spec 010 §6, CA-25)', () => {
  it('CA-25: fechas ISO, el plan programado, el próximo cobro con su plan y la renovación con su plan', () => {
    expect(toSubscriptionView(SUMMARY)).toMatchObject({
      expiresAt: '2026-11-13T12:00:00.000Z',
      status: 'expiring',
      autoRenew: true,
      pendingPlan: { slug: 'pro' },
      pendingPlanDiscarded: false,
      nextCharge: {
        date: '2026-11-13T12:00:00.000Z',
        amountCents: 25_000,
        planName: 'Pro',
        card: { brand: 'visa', last4: '4242' },
      },
      renewal: {
        available: false,
        unavailableReason: 'PLAN_CHANGE_PENDING',
        expectedExpiresAt: '2026-11-13T12:00:00.000Z',
        periodStartsAt: '2026-11-13T12:00:00.000Z',
        periodEndsAt: '2026-12-13T12:00:00.000Z',
        plan: { slug: 'pro', priceCents: 25_000 },
      },
    });
  });

  it('CA-25: en Personal todo lo de pago es nulo', () => {
    const view = toSubscriptionView({
      ...SUMMARY,
      expiresAt: null,
      standing: 'active',
      pendingPlan: null,
      pendingPlanDiscarded: false,
      nextCharge: null,
      renewal: null,
    });

    expect(view).toMatchObject({
      expiresAt: null,
      pendingPlan: null,
      pendingPlanDiscarded: false,
      nextCharge: null,
      renewal: null,
    });
  });
});
