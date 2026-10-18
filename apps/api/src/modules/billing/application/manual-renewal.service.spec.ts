import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { RateLimitExceededError } from '../../../shared/domain/errors';
import type { Subscription } from '../domain/entities/subscription.entity';
import { AlreadyRenewedError } from '../domain/errors/already-renewed.error';
import { NoPaidSubscriptionError } from '../domain/errors/no-paid-subscription.error';
import { PlanChangePendingError } from '../domain/errors/plan-change-pending.error';

import type { BillingLogger } from './billing-logger';
import type { InvoiceIssuer } from './invoice-issuer';
import { ManualRenewalService } from './manual-renewal.service';
import type { PaymentAttemptLimiter } from './payment-attempt-limiter';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import type { RenewalCheckout, RenewalOutcome } from './renewal-checkout';
import { aSubscription } from './testing/subscriptions';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-11-10T12:00:00.000Z');
const EXPIRES = new Date('2026-11-13T12:00:00.000Z');
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const PRO_ID = '10000000-0000-4000-8000-000000000002';
const CARD = { number: '4242424242424242', expMonth: 12, expYear: 2030 };
const COMMAND = { card: CARD, nit: 'CF', expectedExpiresAt: EXPIRES };

const team = (patch = {}): Subscription =>
  aSubscription({
    userId: ANA.id,
    planId: TEAM_ID,
    planSlug: 'equipo',
    startedAt: new Date('2026-10-14T12:00:00.000Z'),
    expiresAt: EXPIRES,
    ...patch,
  });

interface SetupOptions {
  readonly current?: Subscription;
  readonly status?: 'aprobada' | 'rechazada';
  readonly allowed?: boolean;
}

const setup = ({ current = team(), status = 'aprobada', allowed = true }: SetupOptions = {}) => {
  const journal: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('la renovación corre con el actor')),
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
  } as unknown as ISubscriptionRepository;
  const outcome = {
    payment: { id: 'pago-1', status },
    plan: { id: TEAM_ID },
    invoice: status === 'aprobada' ? { id: 'factura-1' } : null,
  } as RenewalOutcome;
  const checkout = {
    renew: jest.fn(() => (journal.push('checkout'), Promise.resolve(outcome))),
  } as unknown as RenewalCheckout;
  const attempts = {
    assertAllowed: jest.fn(() =>
      allowed ? Promise.resolve() : Promise.reject(new RateLimitExceededError(600)),
    ),
  } as unknown as PaymentAttemptLimiter;
  const issuer = {
    issueAfterCommit: jest.fn(() => (journal.push('issue'), Promise.resolve())),
  } as unknown as InvoiceIssuer;
  const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
  const service = new ManualRenewalService(
    transactions,
    subscriptions,
    checkout,
    attempts,
    issuer,
    logger,
    new FixedClock(NOW),
  );
  return { service, journal, checkout, issuer, logger };
};

describe('ManualRenewalService.renew (spec 010 CA-8 a CA-11, CA-26, CA-28; RN-9)', () => {
  it('CA-8: candado y renovación con la tarjeta presente dentro de la transacción; comprobante después', async () => {
    const { service, journal, checkout, logger } = setup();

    await service.renew(ANA, COMMAND);

    expect(journal).toEqual([`begin:${ANA.id}`, 'lock', 'checkout', 'commit', 'issue']);
    expect(checkout.renew).toHaveBeenCalledWith(ANA, expect.any(Object), {
      instrument: CARD,
      nit: 'CF',
      trigger: 'manual',
    });
    expect(logger.info).toHaveBeenCalledWith({
      event: 'billing.payment_approved',
      paymentId: 'pago-1',
      planId: TEAM_ID,
    });
  });

  it('CA-9: un rechazo se devuelve sin comprobante (el 402 es del controlador)', async () => {
    const { service, issuer } = setup({ status: 'rechazada' });

    await expect(service.renew(ANA, COMMAND)).resolves.toMatchObject({ invoice: null });
    expect(issuer.issueAfterCommit).not.toHaveBeenCalled();
  });

  it('CA-10: desde solo lectura con un cambio programado sí se renueva', async () => {
    const { service, checkout } = setup({
      current: team({ status: 'solo_lectura', pendingPlanId: PRO_ID }),
    });

    await service.renew(ANA, COMMAND);

    expect(checkout.renew).toHaveBeenCalled();
  });

  it.each([
    ['CA-11: Personal', aSubscription({ userId: ANA.id }), NoPaidSubscriptionError],
    [
      'CA-26: ya pagado por adelantado',
      team({ startedAt: EXPIRES, expiresAt: new Date('2026-12-13T12:00:00.000Z') }),
      AlreadyRenewedError,
    ],
    [
      'RN-9: `vence_en` cambió desde que lo vio',
      team({ expiresAt: new Date('2026-11-14T12:00:00.000Z') }),
      AlreadyRenewedError,
    ],
    [
      'CA-28: cambio programado a otro plan de pago',
      team({ pendingPlanId: PRO_ID }),
      PlanChangePendingError,
    ],
    [
      'CA-28: cambio programado a Personal',
      team({ pendingPlanId: '10000000-0000-4000-8000-000000000001' }),
      PlanChangePendingError,
    ],
  ])('%s: no cobra', async (_case, current, error) => {
    const { service, checkout, journal } = setup({ current });

    await expect(service.renew(ANA, COMMAND)).rejects.toBeInstanceOf(error);
    expect(checkout.renew).not.toHaveBeenCalled();
    expect(journal).not.toContain('commit');
  });

  it('CA-5 (009): el intento que supera el límite compartido es 429 sin abrir la transacción', async () => {
    const { service, journal } = setup({ allowed: false });

    await expect(service.renew(ANA, COMMAND)).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(journal).toEqual([]);
  });
});
