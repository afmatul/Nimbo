import { chooseNextCycle, resolveNextCycle } from './next-cycle';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { aPlan } from './testing/plans';
import { aSubscription } from './testing/subscriptions';

const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  priceCents: 11_000,
});
const PRO = aPlan({ id: '10000000-0000-4000-8000-000000000002', slug: 'pro', priceCents: 25_000 });
const RETIRED = aPlan({ ...PRO, deactivatedAt: new Date('2026-10-20T00:00:00.000Z') });

describe('plan del siguiente ciclo (spec 010 RN-4, CA-29)', () => {
  it('RN-4: sin cambio programado, el plan actual', () => {
    expect(chooseNextCycle(TEAM, null)).toEqual({ plan: TEAM, discardedPlan: null });
  });

  it('RN-4: el programado si sigue activo', () => {
    expect(chooseNextCycle(TEAM, PRO)).toEqual({ plan: PRO, discardedPlan: null });
  });

  it('CA-29: si el programado se desactivó, se descarta y sigue el actual', () => {
    expect(chooseNextCycle(TEAM, RETIRED)).toEqual({ plan: TEAM, discardedPlan: RETIRED });
  });

  it('resolveNextCycle lee los dos planes de la suscripción', async () => {
    const plans = {
      findById: jest.fn((id: string) => Promise.resolve(id === TEAM.id ? TEAM : RETIRED)),
    } as unknown as IPlanRepository;
    const subscription = aSubscription({ planId: TEAM.id, pendingPlanId: RETIRED.id });

    await expect(resolveNextCycle(plans, subscription)).resolves.toEqual({
      plan: TEAM,
      discardedPlan: RETIRED,
    });
  });
});
