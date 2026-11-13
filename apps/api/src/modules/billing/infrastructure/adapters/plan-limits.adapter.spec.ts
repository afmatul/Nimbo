import { createActor, FixedClock, Role } from '../../../../shared';
import type { Actor, ITransactionRunner } from '../../../../shared';
import type { IPlanRepository } from '../../application/ports/i-plan-repository.port';
import type {
  ISubscriptionRepository,
  SubscriptionStanding,
} from '../../application/ports/i-subscription-repository.port';
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
    maxEditors: 5,
  },
});
const CATALOG: readonly Plan[] = [PERSONAL_PLAN, TEAM];
const NOW = new Date('2026-11-10T12:00:00.000Z');
const EXTRA_UNTIL = new Date('2026-11-16T06:00:00.000Z');
const EXTRA_BYTES = 53_687_091_200n;

const inTeam = (overrides: Partial<SubscriptionStanding> = {}): SubscriptionStanding => ({
  planId: TEAM.id,
  readOnly: false,
  extraQuotaBytes: 0n,
  extraQuotaUntil: null,
  ...overrides,
});

const setup = (standing: SubscriptionStanding | null, catalog: readonly Plan[] = CATALOG) => {
  const scopes: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('los límites se leen con el actor')),
    withActor: (actor, work) => {
      scopes.push(actor.id);
      return work();
    },
  };
  const subscriptions = {
    findStanding: jest.fn().mockResolvedValue(standing),
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
    adapter: new PlanLimitsAdapter(transactions, subscriptions, plans, new FixedClock(NOW)),
    scopes,
    subscriptions,
  };
};

describe('PlanLimitsAdapter (006a CA-2 a CA-5; 009 T-03, PD-80; 016 CA-7, DF-73; 010 ADR-0032)', () => {
  it('T-03: con fila de suscripción, los límites del plan contratado, leídos con withActor del cliente', async () => {
    const { adapter, scopes, subscriptions } = setup(inTeam());

    await expect(adapter.limitsFor(ANA)).resolves.toEqual({
      planName: 'Equipo',
      maxFileBytes: 1_073_741_824n,
      storageQuotaBytes: 375_809_638_400n,
      trashRetentionDays: 60,
      retainedVersions: 60,
      readOnly: false,
      maxEditors: 5,
      extraQuotaBytes: 0n,
      extraQuotaUntil: null,
    });
    expect(scopes).toEqual([ANA.id]);
    expect(subscriptions.findStanding).toHaveBeenCalledWith(ANA);
  });

  it('T-03, CA-5: sin fila (sin verificar o rol interno), los límites de Personal', async () => {
    const { adapter } = setup(null);

    await expect(adapter.limitsFor(createActor(ANA.id, Role.SUPPORT))).resolves.toEqual({
      planName: 'Personal',
      maxFileBytes: 50_000_000n,
      storageQuotaBytes: 15_000_000_000n,
      trashRetentionDays: 7,
      retainedVersions: 3,
      readOnly: false,
      maxEditors: 0,
      extraQuotaBytes: 0n,
      extraQuotaUntil: null,
    });
  });

  it('010 RN-5, CA-12: en solo lectura conserva los límites de su plan y lo dice `readOnly`', async () => {
    const { adapter } = setup(inTeam({ readOnly: true }));

    await expect(adapter.limitsFor(ANA)).resolves.toMatchObject({
      planName: 'Equipo',
      storageQuotaBytes: 375_809_638_400n,
      readOnly: true,
    });
  });

  it('011b CA-4, CA-5: antes de `cuota_extra_hasta`, la cuota suma el extra y lo expone con su fecha', async () => {
    const { adapter } = setup(
      inTeam({ extraQuotaBytes: EXTRA_BYTES, extraQuotaUntil: EXTRA_UNTIL }),
    );

    await expect(adapter.limitsFor(ANA)).resolves.toMatchObject({
      storageQuotaBytes: 375_809_638_400n + EXTRA_BYTES,
      extraQuotaBytes: EXTRA_BYTES,
      extraQuotaUntil: EXTRA_UNTIL,
    });
  });

  it.each([
    ['en el instante de `cuota_extra_hasta`', NOW],
    ['después de `cuota_extra_hasta`', new Date(NOW.getTime() - 1)],
  ])(
    '011b CA-4 (RN-1): %s, la cuota vuelve a la del plan sin trabajo programado',
    async (_, until) => {
      const { adapter } = setup(inTeam({ extraQuotaBytes: EXTRA_BYTES, extraQuotaUntil: until }));

      await expect(adapter.limitsFor(ANA)).resolves.toMatchObject({
        storageQuotaBytes: 375_809_638_400n,
        extraQuotaBytes: 0n,
        extraQuotaUntil: null,
      });
    },
  );

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
