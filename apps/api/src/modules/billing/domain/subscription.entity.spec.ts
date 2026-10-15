import { aPlan, PERSONAL_PLAN } from '../application/testing/plans';

import { PlanNotAvailableError } from './errors/plan-not-available.error';
import { PAID_PLAN_PERIOD_DAYS, Subscription } from './subscription.entity';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
});

const personal = (): Subscription =>
  Subscription.rehydrate({
    userId: '11111111-1111-4111-8111-111111111111',
    planId: PERSONAL_PLAN.id,
    planSlug: PERSONAL_PLAN.slug,
    startedAt: new Date('2026-09-01T00:00:00.000Z'),
    expiresAt: null,
  });

describe('Subscription (spec 009 RN-4, RN-6, CA-3, CA-5)', () => {
  it('RN-4: un plan de pago dura 30 días desde el pago', () => {
    const next = personal().subscribeTo(TEAM, NOW);

    expect(PAID_PLAN_PERIOD_DAYS).toBe(30);
    expect(next).toMatchObject({ planId: TEAM.id, planSlug: 'equipo', startedAt: NOW });
    expect(next.expiresAt).toEqual(new Date('2026-11-13T12:00:00.000Z'));
  });

  it.each([
    ['Personal (gratuito)', PERSONAL_PLAN],
    ['un plan desactivado (RN-6)', TEAM.deactivate(NOW)],
  ])('CA-5: %s no se contrata', (_case, plan) => {
    expect(() => personal().subscribeTo(plan, NOW)).toThrow(PlanNotAvailableError);
  });

  it('CA-5: una cuenta que ya no está en Personal no contrata otro plan (el cambio es de la 010)', () => {
    const paid = personal().subscribeTo(TEAM, NOW);

    expect(() => paid.subscribeTo(TEAM, NOW)).toThrow(PlanNotAvailableError);
  });
});
