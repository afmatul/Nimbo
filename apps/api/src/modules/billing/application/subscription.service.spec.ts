import { createActor, Role } from '../../../shared';
import type { Actor, IRateLimiter, ITransactionRunner } from '../../../shared';
import { RateLimitExceededError } from '../../../shared/domain/errors';
import type { Payment } from '../domain/entities/payment.entity';

import type { BillingLogger } from './billing-logger';
import type { SubscriptionCheckout, SubscribeOutcome } from './subscription-checkout';
import { SubscriptionService } from './subscription.service';
import { aPlan } from './testing/plans';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  priceCents: 11_000,
});
const COMMAND = {
  planSlug: 'equipo',
  card: { number: '4242424242424242', expMonth: 12, expYear: 2030 },
  nit: 'CF',
};

const setup = (options: { status?: Payment['status']; allowed?: boolean } = {}) => {
  const journal: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('el cobro corre con actor')),
    withActor: async (actor, work) => {
      journal.push(`begin:${actor.id}`);
      const result = await work();
      journal.push('commit');
      return result;
    },
  };
  const outcome = {
    payment: { id: 'pago-1', status: options.status ?? 'aprobada' } as Payment,
    plan: TEAM,
  } as SubscribeOutcome;
  const checkout = {
    checkout: jest.fn(() => {
      journal.push('checkout');
      return Promise.resolve(outcome);
    }),
  } as unknown as SubscriptionCheckout;
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
  const service = new SubscriptionService(transactions, checkout, limiter, logger);
  return { service, journal, limiter, logger };
};

describe('SubscriptionService.subscribe (spec 009 CA-5, RN-8; plan §2 y §5)', () => {
  it('RN-8: el cobro completo corre dentro de una transacción con el actor', async () => {
    const { service, journal } = setup();

    await service.subscribe(ANA, COMMAND);

    expect(journal).toEqual([`begin:${ANA.id}`, 'checkout', 'commit']);
  });

  it('CA-5: el intento 11 en 15 minutos es 429 sin abrir la transacción (`billing:subscribe:{actor}`)', async () => {
    const { service, journal, limiter } = setup({ allowed: false });

    await expect(service.subscribe(ANA, COMMAND)).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(limiter.consume).toHaveBeenCalledWith(`billing:subscribe:${ANA.id}`, [
      { limit: 10, windowSeconds: 900 },
    ]);
    expect(journal).toEqual([]);
  });

  it.each([
    ['aprobada', 'billing.payment_approved'],
    ['rechazada', 'billing.payment_rejected'],
  ] as const)(
    'plan §5: un pago %s se registra después del commit, solo con UUID',
    async (status, event) => {
      const { service, logger } = setup({ status });

      await service.subscribe(ANA, COMMAND);

      expect(logger.info).toHaveBeenCalledWith({ event, paymentId: 'pago-1', planId: TEAM.id });
    },
  );
});
