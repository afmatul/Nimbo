import { createActor, Role } from '../../../../shared';
import type { Actor, ITransactionRunner } from '../../../../shared';
import type { IPlanRepository } from '../../application/ports/i-plan-repository.port';
import type { ISubscriptionRepository } from '../../application/ports/i-subscription-repository.port';
import { aPlan, PERSONAL_PLAN } from '../../application/testing/plans';
import type { Plan } from '../../domain/entities/plan.entity';
import { PlanNotFoundError } from '../../domain/errors';

import { PlanLimitsAdapter } from './plan-limits.adapter';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
  limits: {
    ...PERSONAL_PLAN.limits,
    quotaBytes: 375_809_638_400n,
    maxFileBytes: 1_073_741_824n,
    trashRetentionDays: 60,
    retainedVersions: 60,
  },
});
const CATALOG: readonly Plan[] = [PERSONAL_PLAN, TEAM];

const setup = (currentPlanId: string | null, catalog: readonly Plan[] = CATALOG) => {
  const scopes: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('los límites se leen con el actor')),
    withActor: (actor, work) => {
      scopes.push(actor.id);
      return work();
    },
  };
  const subscriptions = {
    findCurrentPlanId: jest.fn().mockResolvedValue(currentPlanId),
  } as unknown as ISubscriptionRepository;
  const plans = {
    findById: jest.fn((id: string) =>
      Promise.resolve(catalog.find((plan) => plan.id === id) ?? null),
    ),
    findBySlug: jest.fn((slug: string) =>
      Promise.resolve(catalog.find((plan) => plan.slug === slug) ?? null),
    ),
  } as unknown as IPlanRepository;
  return {
    adapter: new PlanLimitsAdapter(transactions, subscriptions, plans),
    scopes,
    subscriptions,
  };
};

describe('PlanLimitsAdapter (006a CA-2 a CA-5; 009 T-03, PD-80)', () => {
  it('T-03: con fila de suscripción, los límites del plan contratado, leídos con withActor del cliente', async () => {
    const { adapter, scopes, subscriptions } = setup(TEAM.id);

    await expect(adapter.limitsFor(ANA)).resolves.toEqual({
      planName: 'Equipo',
      maxFileBytes: 1_073_741_824n,
      storageQuotaBytes: 375_809_638_400n,
      trashRetentionDays: 60,
      retainedVersions: 60,
    });
    expect(scopes).toEqual([ANA.id]);
    expect(subscriptions.findCurrentPlanId).toHaveBeenCalledWith(ANA);
  });

  it('T-03, CA-5: sin fila (sin verificar o rol interno), los límites de Personal', async () => {
    const { adapter } = setup(null);

    await expect(adapter.limitsFor(createActor(ANA.id, Role.SUPPORT))).resolves.toEqual({
      planName: 'Personal',
      maxFileBytes: 52_428_800n,
      storageQuotaBytes: 16_106_127_360n,
      trashRetentionDays: 7,
      retainedVersions: 3,
    });
  });

  it('CA-4: sin la fila `personal` en `plan`, PlanNotFoundError', async () => {
    const { adapter } = setup(null, [TEAM]);

    await expect(adapter.limitsFor(ANA)).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('CA-2 y CA-3: por id y por slug; CA-4: inexistente es PlanNotFoundError', async () => {
    const { adapter } = setup(null);

    await expect(adapter.getLimitsByPlanId(TEAM.id)).resolves.toMatchObject({ planName: 'Equipo' });
    await expect(adapter.getLimitsBySlug('personal')).resolves.toMatchObject({
      planName: 'Personal',
    });
    await expect(adapter.getLimitsByPlanId('no-existe')).rejects.toBeInstanceOf(PlanNotFoundError);
    await expect(adapter.getLimitsBySlug('no-existe')).rejects.toBeInstanceOf(PlanNotFoundError);
  });
});
