import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { Payment } from '../domain/entities/payment.entity';
import { PlanNotAvailableError } from '../domain/errors/plan-not-available.error';

import type { PendingPlanRegistry } from '../../identity';

import type { InvoiceService } from './invoice.service';
import type { PaymentService } from './payment.service';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { SubscriptionCheckout } from './subscription-checkout';
import { aPlan } from './testing/plans';
import { aSubscription } from './testing/subscriptions';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-14T12:00:00.000Z');
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
});
const COMMAND = {
  planSlug: 'equipo',
  card: { number: '4242424242424242', expMonth: 12, expYear: 2030 },
  nit: 'CF',
};

const setup = (options: { status?: Payment['status']; plan?: typeof TEAM | null } = {}) => {
  const journal: string[] = [];
  const step =
    <T>(name: string, value: T) =>
    (): Promise<T> => {
      journal.push(name);
      return Promise.resolve(value);
    };
  const current = aSubscription({
    userId: ANA.id,
    startedAt: new Date('2026-09-01T00:00:00.000Z'),
  });
  const subscriptions: ISubscriptionRepository = {
    insertPersonalIfAbsent: jest.fn(step('personal', undefined)),
    findStanding: jest.fn(),
    findCurrent: jest.fn(),
    markReminderSent: jest.fn(),
    markExpiredNoticeSent: jest.fn(),
    lockCurrent: jest.fn(step('lock', current)),
    save: jest.fn(step('save', undefined)),
  };
  const plans = {
    findBySlug: jest.fn(() => Promise.resolve(options.plan === undefined ? TEAM : options.plan)),
  } as unknown as IPlanRepository;
  const status = options.status ?? 'aprobada';
  const payment = { id: 'pago-1', status, reference: 'SIM-2026-000001' } as Payment;
  const payments = {
    charge: jest.fn(step(`charge:${status}`, payment)),
  } as unknown as PaymentService;
  const invoices = {
    register: jest.fn(step('invoice', { id: 'factura-1' })),
  } as unknown as InvoiceService;
  const pendingPlans = {
    clear: jest.fn(step('pending-cleared', undefined)),
  } as unknown as PendingPlanRegistry;
  const checkout = new SubscriptionCheckout(
    subscriptions,
    plans,
    payments,
    invoices,
    new FixedClock(NOW),
    pendingPlans,
  );
  return { checkout, journal, payments, invoices, pendingPlans };
};

describe('SubscriptionCheckout (spec 009 CA-3 a CA-6, RN-8; plan §2)', () => {
  it('RN-8: fila Personal, candado, cobro, suscripción de 30 días, factura y plan pendiente, en ese orden', async () => {
    const { checkout, journal, payments, pendingPlans } = setup();

    const outcome = await checkout.checkout(ANA, COMMAND);

    expect(journal).toEqual([
      'personal',
      'lock',
      'charge:aprobada',
      'save',
      'invoice',
      'pending-cleared',
    ]);
    expect(pendingPlans.clear).toHaveBeenCalledWith(ANA);
    expect(payments.charge).toHaveBeenCalledWith(
      ANA,
      expect.objectContaining({ instrument: COMMAND.card }),
    );
    expect(outcome.subscription).toMatchObject({
      planId: TEAM.id,
      expiresAt: new Date('2026-11-13T12:00:00.000Z'),
    });
    expect(outcome.invoice).toMatchObject({ id: 'factura-1' });
  });

  it('CA-6: la factura lleva el pago y el NIT del cobro', async () => {
    const { checkout, invoices } = setup();

    await checkout.checkout(ANA, { ...COMMAND, nit: '12345678' });

    expect(invoices.register).toHaveBeenCalledWith(
      ANA,
      expect.objectContaining({ id: 'pago-1' }),
      '12345678',
    );
  });

  it('CA-4, CA-6: un rechazo no mueve la suscripción, no factura ni descarta el plan pendiente', async () => {
    const { checkout, journal } = setup({ status: 'rechazada' });

    const outcome = await checkout.checkout(ANA, COMMAND);

    expect(journal).toEqual(['personal', 'lock', 'charge:rechazada']);
    expect(outcome.subscription.planSlug).toBe('personal');
    expect(outcome.invoice).toBeNull();
  });

  it('CA-5: un plan inexistente es `BILLING_PLAN_NOT_AVAILABLE` sin cobrar', async () => {
    const { checkout, payments } = setup({ plan: null });

    await expect(
      checkout.checkout(ANA, { ...COMMAND, planSlug: 'no-existe' }),
    ).rejects.toBeInstanceOf(PlanNotAvailableError);
    expect(payments.charge).not.toHaveBeenCalled();
  });
});
