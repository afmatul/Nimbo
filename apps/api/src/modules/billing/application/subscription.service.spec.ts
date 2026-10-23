import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { RateLimitExceededError } from '../../../shared/domain/errors';
import type { Payment } from '../domain/entities/payment.entity';

import type { BillingLogger } from './billing-logger';
import type { InvoiceIssuer } from './invoice-issuer';
import type { PaymentAttemptLimiter } from './payment-attempt-limiter';
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
  const status = options.status ?? 'aprobada';
  const outcome = {
    payment: { id: 'pago-1', status } as Payment,
    plan: TEAM,
    invoice: status === 'aprobada' ? { id: 'factura-1' } : null,
  } as SubscribeOutcome;
  const checkout = {
    checkout: jest.fn(() => {
      journal.push('checkout');
      return Promise.resolve(outcome);
    }),
  } as unknown as SubscriptionCheckout;
  const limiter = {
    assertAllowed: jest.fn(() =>
      options.allowed === false
        ? Promise.reject(new RateLimitExceededError(600))
        : Promise.resolve(),
    ),
  } as unknown as PaymentAttemptLimiter;
  const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
  const issuer = {
    issueAfterCommit: jest.fn(() => {
      journal.push('issue');
      return Promise.resolve();
    }),
  } as unknown as InvoiceIssuer;
  const service = new SubscriptionService(transactions, checkout, limiter, logger, issuer);
  return { service, journal, limiter, logger, issuer };
};

describe('SubscriptionService.subscribe (spec 009 CA-5, RN-8; plan §2 y §5)', () => {
  it('RN-8: el cobro completo corre dentro de una transacción con el actor', async () => {
    const { service, journal } = setup();

    await service.subscribe(ANA, COMMAND);

    expect(journal.slice(0, 3)).toEqual([`begin:${ANA.id}`, 'checkout', 'commit']);
  });

  it('CA-5: el intento que supera el límite compartido es 429 sin abrir la transacción', async () => {
    const { service, journal, limiter } = setup({ allowed: false });

    await expect(service.subscribe(ANA, COMMAND)).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(limiter.assertAllowed).toHaveBeenCalledWith(ANA);
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

  it('CA-6, RN-8: emite el PDF de la factura después del commit', async () => {
    const { service, journal, issuer } = setup();

    await service.subscribe(ANA, COMMAND);

    expect(journal).toEqual([`begin:${ANA.id}`, 'checkout', 'commit', 'issue']);
    expect(issuer.issueAfterCommit).toHaveBeenCalledWith(ANA, 'factura-1');
  });

  it('CA-6: un rechazo no tiene factura que emitir', async () => {
    const { service, issuer } = setup({ status: 'rechazada' });

    await service.subscribe(ANA, COMMAND);

    expect(issuer.issueAfterCommit).not.toHaveBeenCalled();
  });
});
