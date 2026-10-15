import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor, IRateLimiter, ITransactionRunner } from '../../../shared';
import { RateLimitExceededError } from '../../../shared/domain/errors';
import type { Payment } from '../domain/entities/payment.entity';
import { PlanNotAvailableError } from '../domain/errors/plan-not-available.error';
import { Subscription } from '../domain/subscription.entity';

import type { BillingLogger } from './billing-logger';
import type { PaymentService } from './payment.service';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { SubscriptionService } from './subscription.service';
import { aPlan, PERSONAL_PLAN } from './testing/plans';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-14T12:00:00.000Z');
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
});
const CARD = { number: '4242424242424242', expMonth: 12, expYear: 2030 };

const setup = (
  options: { status?: Payment['status']; allowed?: boolean; plan?: typeof TEAM | null } = {},
) => {
  const journal: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('el cobro corre con actor')),
    withActor: async (_actor, work) => {
      journal.push('begin');
      const result = await work();
      journal.push('commit');
      return result;
    },
  };
  const current = Subscription.rehydrate({
    userId: ANA.id,
    planId: PERSONAL_PLAN.id,
    planSlug: PERSONAL_PLAN.slug,
    startedAt: new Date('2026-09-01T00:00:00.000Z'),
    expiresAt: null,
  });
  const subscriptions: ISubscriptionRepository = {
    insertPersonalIfAbsent: jest.fn(() => {
      journal.push('personal');
      return Promise.resolve();
    }),
    lockCurrent: jest.fn(() => {
      journal.push('lock');
      return Promise.resolve(current);
    }),
    save: jest.fn(() => {
      journal.push('save');
      return Promise.resolve();
    }),
  };
  const plans = {
    findBySlug: jest.fn(() => Promise.resolve(options.plan === undefined ? TEAM : options.plan)),
  } as unknown as IPlanRepository;
  const status = options.status ?? 'aprobada';
  const payments = {
    charge: jest.fn(() => {
      journal.push(`charge:${status}`);
      return Promise.resolve({ id: 'pago-1', status, reference: 'SIM-2026-000001' } as Payment);
    }),
  } as unknown as PaymentService;
  const limiter: IRateLimiter = {
    consume: jest.fn(() =>
      Promise.resolve(
        options.allowed === false
          ? { allowed: false as const, retryAfterSeconds: 600 }
          : { allowed: true as const },
      ),
    ),
  };
  const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
  const service = new SubscriptionService(
    transactions,
    subscriptions,
    plans,
    payments,
    limiter,
    new FixedClock(NOW),
    logger,
  );
  return { service, journal, subscriptions, payments, limiter, logger };
};

describe('SubscriptionService.subscribe (spec 009 CA-3 a CA-5, RN-8; plan §2)', () => {
  it('RN-8: garantiza la fila Personal, la bloquea, cobra y mueve la suscripción en una sola transacción', async () => {
    const { service, journal } = setup();

    const outcome = await service.subscribe(ANA, { planSlug: 'equipo', card: CARD });

    expect(journal).toEqual(['begin', 'personal', 'lock', 'charge:aprobada', 'save', 'commit']);
    expect(outcome.subscription).toMatchObject({
      planId: TEAM.id,
      expiresAt: new Date('2026-11-13T12:00:00.000Z'),
    });
  });

  it('CA-4, B-3: un rechazo se confirma como fila y la suscripción no cambia', async () => {
    const { service, journal } = setup({ status: 'rechazada' });

    const outcome = await service.subscribe(ANA, { planSlug: 'equipo', card: CARD });

    expect(journal).toEqual(['begin', 'personal', 'lock', 'charge:rechazada', 'commit']);
    expect(outcome.payment.status).toBe('rechazada');
    expect(outcome.subscription.planSlug).toBe('personal');
  });

  it('CA-5: un plan inexistente es `BILLING_PLAN_NOT_AVAILABLE` sin cobrar', async () => {
    const { service, payments } = setup({ plan: null });

    await expect(
      service.subscribe(ANA, { planSlug: 'no-existe', card: CARD }),
    ).rejects.toBeInstanceOf(PlanNotAvailableError);
    expect(payments.charge).not.toHaveBeenCalled();
  });

  it('CA-5: el intento 11 en 15 minutos es 429 sin abrir la transacción (`billing:subscribe:{actor}`)', async () => {
    const { service, journal, limiter } = setup({ allowed: false });

    await expect(service.subscribe(ANA, { planSlug: 'equipo', card: CARD })).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(limiter.consume).toHaveBeenCalledWith(`billing:subscribe:${ANA.id}`, [
      { limit: 10, windowSeconds: 900 },
    ]);
    expect(journal).toEqual([]);
  });

  it('plan §5: registra el resultado después del commit, solo con UUID', async () => {
    const { service, logger } = setup({ status: 'rechazada' });

    await service.subscribe(ANA, { planSlug: 'equipo', card: CARD });

    expect(logger.info).toHaveBeenCalledWith({
      event: 'billing.payment_rejected',
      paymentId: 'pago-1',
      planId: TEAM.id,
    });
  });
});
