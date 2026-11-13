import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { AuditRecord, IAuditLogger } from '../../audit';
import type { Plan } from '../domain/entities/plan.entity';
import type { Subscription } from '../domain/entities/subscription.entity';
import { NoPaidSubscriptionError } from '../domain/errors/no-paid-subscription.error';
import { NoPendingPlanChangeError } from '../domain/errors/no-pending-plan-change.error';
import { PlanChangeInvalidError } from '../domain/errors/plan-change-invalid.error';

import type { BillingHistoryService } from './billing-history.service';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { SubscriptionSettingsService } from './subscription-settings.service';
import { aPlan, PERSONAL_PLAN } from './testing/plans';
import { aSubscription } from './testing/subscriptions';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-11-01T12:00:00.000Z');
const EXPIRES = new Date('2026-11-13T12:00:00.000Z');
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  priceCents: 11_000,
});
const PRO = aPlan({ id: '10000000-0000-4000-8000-000000000002', slug: 'pro', priceCents: 25_000 });
const RETIRED = aPlan({
  ...PRO,
  id: '10000000-0000-4000-8000-000000000009',
  slug: 'viejo',
  deactivatedAt: NOW,
});
const CATALOG: readonly Plan[] = [PERSONAL_PLAN, TEAM, PRO, RETIRED];

const team = (patch: Parameters<typeof aSubscription>[0] = {}): Subscription =>
  aSubscription({
    userId: ANA.id,
    planId: TEAM.id,
    planSlug: TEAM.slug,
    expiresAt: EXPIRES,
    ...patch,
  });

const setup = (current: Subscription = team()) => {
  const journal: string[] = [];
  const saved: Subscription[] = [];
  const audits: AuditRecord[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('los ajustes corren con el actor')),
    withActor: async (actor, work) => {
      journal.push(`begin:${actor.id}`);
      const result = await work();
      journal.push('commit');
      return result;
    },
  };
  const subscriptions = {
    insertPersonalIfAbsent: jest.fn(() => Promise.resolve()),
    lockCurrent: jest.fn(() => (journal.push('lock'), Promise.resolve(current))),
    save: jest.fn((_actor: Actor, next: Subscription) => (saved.push(next), Promise.resolve())),
  } as unknown as ISubscriptionRepository;
  const plans = {
    findBySlug: jest.fn((slug: string) =>
      Promise.resolve(CATALOG.find((plan) => plan.slug === slug) ?? null),
    ),
  } as unknown as IPlanRepository;
  const audit: IAuditLogger = {
    record: jest.fn(() => Promise.reject(new Error('los ajustes auditan en su transacción'))),
    recordInTransaction: jest.fn((entry: AuditRecord) => (audits.push(entry), Promise.resolve())),
  };
  const views = {
    subscription: jest.fn(() => (journal.push('view'), Promise.resolve(null))),
  } as unknown as BillingHistoryService;
  const service = new SubscriptionSettingsService(
    transactions,
    subscriptions,
    plans,
    audit,
    views,
    new FixedClock(NOW),
  );
  return { service, journal, saved, audits };
};

describe('SubscriptionSettingsService (spec 010 CA-6, CA-16 a CA-19, CA-22, CA-27)', () => {
  it('CA-6: apaga la renovación automática con la fila bloqueada, audita y responde la vista nueva', async () => {
    const { service, journal, saved, audits } = setup();

    await service.setAutoRenew(ANA, false);

    expect(journal).toEqual([`begin:${ANA.id}`, 'lock', 'commit', 'view']);
    expect(saved).toMatchObject([{ autoRenew: false, expiresAt: EXPIRES }]);
    expect(audits).toEqual([
      {
        action: 'subscription.auto_renew_changed',
        actor: ANA,
        targetUserId: ANA.id,
        attributes: { enabled: false },
      },
    ]);
  });

  it('CA-6, CA-18: con Personal es BILLING_NO_PAID_SUBSCRIPTION y nada se guarda', async () => {
    const { service, saved } = setup(aSubscription({ userId: ANA.id }));

    await expect(service.setAutoRenew(ANA, false)).rejects.toBeInstanceOf(NoPaidSubscriptionError);
    await expect(service.scheduleChange(ANA, 'pro')).rejects.toBeInstanceOf(
      NoPaidSubscriptionError,
    );
    expect(saved).toEqual([]);
  });

  it('CA-16: programa Pro para el siguiente ciclo sin tocar el plan ni el periodo', async () => {
    const { service, saved, audits } = setup();

    await service.scheduleChange(ANA, 'pro');

    expect(saved).toMatchObject([{ planId: TEAM.id, pendingPlanId: PRO.id, expiresAt: EXPIRES }]);
    expect(audits).toMatchObject([
      { action: 'subscription.plan_change_scheduled', attributes: { planSlug: 'pro' } },
    ]);
  });

  it('CA-16: informa el plan programado y que aplica en la próxima fecha de cobro', async () => {
    const { service } = setup();

    const outcome = await service.scheduleChange(ANA, 'pro');

    expect(outcome.change).toEqual({ plan: PRO, effectiveAt: EXPIRES });
  });

  it.each(['no-existe', 'viejo', 'equipo'])(
    'CA-17: «%s» es BILLING_PLAN_CHANGE_INVALID y nada se guarda',
    async (slug) => {
      const { service, saved } = setup();

      await expect(service.scheduleChange(ANA, slug)).rejects.toBeInstanceOf(
        PlanChangeInvalidError,
      );
      expect(saved).toEqual([]);
    },
  );

  it('CA-27: en solo lectura la bajada a Personal se aplica ya y termina la solo lectura', async () => {
    const { service, saved, audits } = setup(team({ status: 'solo_lectura' }));

    const outcome = await service.scheduleChange(ANA, 'personal');

    expect(outcome.change).toEqual({ plan: PERSONAL_PLAN, effectiveAt: NOW });
    expect(saved).toMatchObject([
      { planId: PERSONAL_PLAN.id, status: 'vigente', expiresAt: null, pendingPlanId: null },
    ]);
    expect(audits.map((entry) => entry.action)).toEqual([
      'subscription.plan_change_scheduled',
      'subscription.plan_change_applied',
      'subscription.read_only_exited',
    ]);
  });

  it('CA-19: cancela el cambio programado y lo audita', async () => {
    const { service, saved, audits } = setup(team({ pendingPlanId: PRO.id }));

    await service.cancelChange(ANA);

    expect(saved).toMatchObject([{ pendingPlanId: null }]);
    expect(audits).toMatchObject([{ action: 'subscription.plan_change_cancelled' }]);
  });

  it('CA-19: sin cambio programado es BILLING_NO_PENDING_PLAN_CHANGE', async () => {
    const { service } = setup();

    await expect(service.cancelChange(ANA)).rejects.toBeInstanceOf(NoPendingPlanChangeError);
  });
});
