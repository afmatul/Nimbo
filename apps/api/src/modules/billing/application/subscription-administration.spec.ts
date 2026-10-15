import { createActor, Role } from '../../../shared';
import { PlanNotFoundError } from '../domain/errors';

import type { IPlanRepository } from './ports/i-plan-repository.port';
import { SubscriptionAdministration } from './subscription-administration';
import { PERSONAL_PLAN } from './testing/plans';

const ADMIN = createActor('30000000-0000-4000-8000-000000000001', Role.ADMIN);
const CLIENTS = ['40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'];

const setup = (personal = PERSONAL_PLAN) => {
  const plans = { findBySlug: jest.fn().mockResolvedValue(personal) } as unknown as IPlanRepository;
  return { administration: new SubscriptionAdministration(plans), plans };
};

describe('SubscriptionAdministration hasta la 009 (spec 011 CA-1, CA-12; PD-80)', () => {
  it('CA-1, PD-80: todo cliente tiene el plan Personal', async () => {
    const { administration } = setup();

    const names = await administration.planNamesFor(ADMIN, CLIENTS);

    expect([...names]).toEqual(CLIENTS.map((id) => [id, 'Personal']));
  });

  it('CA-12, PD-80: todos los clientes cuentan en Personal', async () => {
    const { administration } = setup();

    await expect(administration.clientCountsByPlan(ADMIN, 7)).resolves.toEqual([
      { planId: PERSONAL_PLAN.id, clientCount: 7 },
    ]);
  });

  it('CA-12: sin clientes, Personal aparece con 0', async () => {
    const { administration } = setup();

    await expect(administration.clientCountsByPlan(ADMIN, 0)).resolves.toEqual([
      { planId: PERSONAL_PLAN.id, clientCount: 0 },
    ]);
  });

  it('006a CA-4: si falta Personal en el catálogo es `PLAN_NOT_FOUND`', async () => {
    const { administration } = setup(null as unknown as typeof PERSONAL_PLAN);

    await expect(administration.planNamesFor(ADMIN, CLIENTS)).rejects.toBeInstanceOf(
      PlanNotFoundError,
    );
  });
});
