import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { PendingPlanRegistry } from '../../identity';
import type { Plan } from '../domain/entities/plan.entity';

import { PendingPlanScreening } from './pending-plan-screening';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { aPlan, PERSONAL_PLAN } from './testing/plans';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const PRO = aPlan({ id: '10000000-0000-4000-8000-000000000002', slug: 'pro', priceCents: 5_000 });

const setup = (plan: Plan | null) => {
  const plans = { findBySlug: jest.fn(() => Promise.resolve(plan)) } as unknown as IPlanRepository;
  const pendingPlans = { clear: jest.fn(() => Promise.resolve()) } as unknown as PendingPlanRegistry;
  return { screening: new PendingPlanScreening(plans, pendingPlans), plans, pendingPlans };
};

describe('PendingPlanScreening (registro con plan)', () => {
  it('conserva un plan de pago activo para que la web lleve al cobro', async () => {
    const { screening, plans, pendingPlans } = setup(PRO);

    await screening.screen(ANA, 'pro');

    expect(plans.findBySlug).toHaveBeenCalledWith('pro');
    expect(pendingPlans.clear).not.toHaveBeenCalled();
  });

  it.each([
    ['gratuito (Personal)', PERSONAL_PLAN],
    ['inexistente', null],
    ['dado de baja', aPlan({ ...PRO, deactivatedAt: new Date('2026-11-01T00:00:00.000Z') })],
  ])('descarta un plan %s', async (_case, plan) => {
    const { screening, pendingPlans } = setup(plan);

    await screening.screen(ANA, 'cualquiera');

    expect(pendingPlans.clear).toHaveBeenCalledWith(ANA);
  });

  it('sin plan pendiente no consulta el catálogo ni escribe', async () => {
    const { screening, plans, pendingPlans } = setup(PRO);

    await screening.screen(ANA, null);

    expect(plans.findBySlug).not.toHaveBeenCalled();
    expect(pendingPlans.clear).not.toHaveBeenCalled();
  });
});
