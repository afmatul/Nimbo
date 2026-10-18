import type { Subscription } from '../domain/entities/subscription.entity';

import { summarizeSubscription } from './subscription-summary';
import type { SubscriptionFacts } from './subscription-summary';
import { aPlan, PERSONAL_PLAN } from './testing/plans';
import { aSubscription } from './testing/subscriptions';

const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  priceCents: 11_000,
});
const PRO = aPlan({ id: '10000000-0000-4000-8000-000000000002', slug: 'pro', priceCents: 25_000 });
const NOW = new Date('2026-11-01T12:00:00.000Z');
const DAY_MS = 86_400_000;
const CLOCK = { now: NOW, reminderDays: 3 };
const CARD = { brand: 'visa', last4: '4242' };

const team = (patch: Parameters<typeof aSubscription>[0] = {}): Subscription =>
  aSubscription({
    planId: TEAM.id,
    planSlug: TEAM.slug,
    startedAt: new Date('2026-10-14T12:00:00.000Z'),
    expiresAt: new Date('2026-11-13T12:00:00.000Z'),
    ...patch,
  });

const facts = (
  subscription: Subscription,
  pendingPlan: SubscriptionFacts['pendingPlan'] = null,
) => ({
  subscription,
  plan: subscription.planId === PERSONAL_PLAN.id ? PERSONAL_PLAN : TEAM,
  pendingPlan,
  card: CARD,
});

describe('summarizeSubscription (spec 010 §6, CA-8, CA-25, CA-26, CA-28; RN-8)', () => {
  it('CA-25: vigente con renovación automática, el próximo cobro es el plan actual al vencer', () => {
    const summary = summarizeSubscription(facts(team()), CLOCK);

    expect(summary).toMatchObject({
      standing: 'active',
      nextCharge: { date: new Date('2026-11-13T12:00:00.000Z'), plan: TEAM, card: CARD },
      renewal: {
        available: true,
        plan: TEAM,
        expectedExpiresAt: new Date('2026-11-13T12:00:00.000Z'),
      },
    });
  });

  it.each([
    [3 * DAY_MS, 'expiring'],
    [3 * DAY_MS + 1, 'active'],
  ])('RN-8: a %i ms de vencer, %s', (beforeExpiry, standing) => {
    const subscription = team({ expiresAt: new Date(NOW.getTime() + beforeExpiry) });

    expect(summarizeSubscription(facts(subscription), CLOCK).standing).toBe(standing);
  });

  it('CA-7: sin renovación automática no hay próximo cobro, pero sí «Renovar ahora»', () => {
    const summary = summarizeSubscription(facts(team({ autoRenew: false })), CLOCK);

    expect(summary).toMatchObject({
      autoRenew: false,
      nextCharge: null,
      renewal: { available: true },
    });
  });

  it('CA-16, CA-28: con cambio a Pro, el próximo cobro es Pro y no se ofrece renovar por adelantado', () => {
    const summary = summarizeSubscription(facts(team({ pendingPlanId: PRO.id }), PRO), CLOCK);

    expect(summary).toMatchObject({
      pendingPlan: PRO,
      nextCharge: { plan: PRO },
      renewal: { available: false, unavailableReason: 'PLAN_CHANGE_PENDING', plan: PRO },
    });
  });

  it('RN-7: con la bajada a Personal programada no hay cobro', () => {
    const summary = summarizeSubscription(
      facts(team({ pendingPlanId: PERSONAL_PLAN.id }), PERSONAL_PLAN),
      CLOCK,
    );

    expect(summary.nextCharge).toBeNull();
  });

  it('CA-10: en solo lectura no hay cobro automático y la renovación empieza ahora', () => {
    const summary = summarizeSubscription(
      facts(team({ status: 'solo_lectura', expiresAt: new Date('2026-10-30T12:00:00.000Z') })),
      CLOCK,
    );

    expect(summary).toMatchObject({
      standing: 'readOnly',
      nextCharge: null,
      renewal: { available: true, periodStartsAt: NOW },
    });
  });

  it('CA-26: ya pagado por adelantado, no se ofrece otro periodo', () => {
    const summary = summarizeSubscription(
      facts(
        team({
          startedAt: new Date('2026-11-13T12:00:00.000Z'),
          expiresAt: new Date('2026-12-13T12:00:00.000Z'),
        }),
      ),
      CLOCK,
    );

    expect(summary.renewal).toMatchObject({
      available: false,
      unavailableReason: 'ALREADY_RENEWED',
    });
  });

  it('CA-25: en Personal todo lo de pago es nulo', () => {
    const summary = summarizeSubscription(facts(aSubscription()), CLOCK);

    expect(summary).toMatchObject({
      plan: PERSONAL_PLAN,
      expiresAt: null,
      standing: 'active',
      pendingPlan: null,
      nextCharge: null,
      renewal: null,
    });
  });
});
