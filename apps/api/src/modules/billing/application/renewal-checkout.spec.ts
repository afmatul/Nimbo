import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { AuditRecord, IAuditLogger } from '../../audit';
import type { Invoice } from '../domain/entities/invoice.entity';
import type { Payment } from '../domain/entities/payment.entity';
import type { Plan } from '../domain/entities/plan.entity';
import { Money } from '../domain/value-objects/money';

import type { InvoiceService } from './invoice.service';
import type { PaymentService } from './payment.service';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { RenewalCheckout } from './renewal-checkout';
import type { RenewalOrder } from './renewal-checkout';
import { aPlan } from './testing/plans';
import { aSubscription } from './testing/subscriptions';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-11-10T12:00:00.000Z');
const EXPIRES = new Date('2026-11-13T12:00:00.000Z');
const DAY_MS = 86_400_000;
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  priceCents: 11_000,
});
const PRO = aPlan({ id: '10000000-0000-4000-8000-000000000002', slug: 'pro', priceCents: 25_000 });
const RETIRED = aPlan({ ...PRO, deactivatedAt: new Date('2026-11-01T00:00:00.000Z') });
const ORDER: RenewalOrder = {
  instrument: { number: '4242424242424242', expMonth: 12, expYear: 2030 },
  nit: 'CF',
  trigger: 'manual',
};

const team = (patch = {}) =>
  aSubscription({
    userId: ANA.id,
    planId: TEAM.id,
    planSlug: TEAM.slug,
    startedAt: new Date('2026-10-14T12:00:00.000Z'),
    expiresAt: EXPIRES,
    ...patch,
  });

const setup = (status: Payment['status'] = 'aprobada', catalog: readonly Plan[] = [TEAM, PRO]) => {
  const journal: string[] = [];
  const audits: AuditRecord[] = [];
  const subscriptions = {
    save: jest.fn(() => (journal.push('save'), Promise.resolve())),
  } as unknown as ISubscriptionRepository;
  const plans = {
    findById: jest.fn((id: string) =>
      Promise.resolve(catalog.find((plan) => plan.id === id) ?? null),
    ),
  } as unknown as IPlanRepository;
  const payments = {
    charge: jest.fn(
      () => (journal.push('charge'), Promise.resolve({ id: 'pago-1', status } as Payment)),
    ),
  } as unknown as PaymentService;
  const invoices = {
    register: jest.fn(
      () => (journal.push('invoice'), Promise.resolve({ id: 'factura-1' } as Invoice)),
    ),
  } as unknown as InvoiceService;
  const audit: IAuditLogger = {
    record: jest.fn(() => Promise.reject(new Error('la renovación audita en su transacción'))),
    recordInTransaction: jest.fn((entry: AuditRecord) => (audits.push(entry), Promise.resolve())),
  };
  const checkout = new RenewalCheckout(
    subscriptions,
    plans,
    payments,
    invoices,
    audit,
    new FixedClock(NOW),
  );
  return { checkout, journal, audits, subscriptions, payments };
};

const actionsOf = (audits: readonly AuditRecord[]) => audits.map((entry) => entry.action);

describe('RenewalCheckout.renew (spec 010 RN-1, RN-4, CA-8 a CA-10, CA-20, CA-29)', () => {
  it('CA-8, RN-1: aprobada, el periodo nuevo empieza en el `vence_en` vigente, factura y auditoría', async () => {
    const { checkout, journal, audits, subscriptions } = setup();

    const outcome = await checkout.renew(ANA, team(), ORDER);

    expect(journal).toEqual(['charge', 'save', 'invoice']);
    expect(outcome.subscription).toMatchObject({
      planId: TEAM.id,
      startedAt: EXPIRES,
      expiresAt: new Date(EXPIRES.getTime() + 30 * DAY_MS),
    });
    expect(subscriptions.save).toHaveBeenCalledWith(ANA, outcome.subscription);
    expect(audits).toEqual([
      {
        action: 'subscription.renewed',
        actor: ANA,
        targetUserId: ANA.id,
        attributes: { trigger: 'manual', planSlug: 'equipo', amountCents: 11_000 },
      },
    ]);
  });

  it('RN-4: cobra el precio completo del plan del siguiente ciclo con la tarjeta recibida', async () => {
    const { checkout, payments } = setup();

    await checkout.renew(ANA, team({ status: 'solo_lectura', pendingPlanId: PRO.id }), ORDER);

    expect(payments.charge).toHaveBeenCalledWith(ANA, {
      planId: PRO.id,
      amount: Money.ofCents(25_000),
      instrument: ORDER.instrument,
    });
  });

  it('CA-9: rechazada, no guarda ni factura; audita el rechazo y devuelve la suscripción sin cambios', async () => {
    const { checkout, journal, audits } = setup('rechazada');
    const current = team();

    const outcome = await checkout.renew(ANA, current, ORDER);

    expect(journal).toEqual(['charge']);
    expect(outcome).toMatchObject({ subscription: current, invoice: null, discardedPlan: null });
    expect(audits).toMatchObject([
      {
        action: 'subscription.renewal_rejected',
        attributes: { trigger: 'manual', planSlug: 'equipo' },
      },
    ]);
  });

  it('CA-2, CA-20: automática rechazada, solo lectura con el mismo plan y el cambio programado se conserva', async () => {
    const { checkout, journal, audits } = setup('rechazada');

    const outcome = await checkout.renew(ANA, team({ pendingPlanId: PRO.id }), {
      ...ORDER,
      instrument: 'SIM-TOK-decline-1',
      trigger: 'automatic',
    });

    expect(journal).toEqual(['charge', 'save']);
    expect(outcome.subscription).toMatchObject({
      planId: TEAM.id,
      status: 'solo_lectura',
      pendingPlanId: PRO.id,
      expiresAt: EXPIRES,
    });
    expect(actionsOf(audits)).toEqual([
      'subscription.renewal_rejected',
      'subscription.read_only_entered',
    ]);
  });

  it('CA-10, CA-20: desde solo lectura empieza ahora, aplica el cambio programado y sale de solo lectura', async () => {
    const { checkout, audits } = setup();

    const outcome = await checkout.renew(
      ANA,
      team({ status: 'solo_lectura', pendingPlanId: PRO.id }),
      ORDER,
    );

    expect(outcome.subscription).toMatchObject({
      planId: PRO.id,
      status: 'vigente',
      pendingPlanId: null,
      startedAt: NOW,
    });
    expect(actionsOf(audits)).toEqual([
      'subscription.renewed',
      'subscription.read_only_exited',
      'subscription.plan_change_applied',
    ]);
  });

  it('CA-29: un plan programado desactivado se descarta y se renueva con el actual', async () => {
    const { checkout, payments, audits } = setup('aprobada', [TEAM, RETIRED]);

    const outcome = await checkout.renew(
      ANA,
      team({ status: 'solo_lectura', pendingPlanId: RETIRED.id }),
      ORDER,
    );

    expect(payments.charge).toHaveBeenCalledWith(ANA, expect.objectContaining({ planId: TEAM.id }));
    expect(outcome).toMatchObject({
      plan: TEAM,
      subscription: { planId: TEAM.id, pendingPlanId: null },
      discardedPlan: RETIRED,
    });
    expect(audits.at(-1)).toMatchObject({
      action: 'subscription.plan_change_discarded',
      attributes: { planSlug: 'pro' },
    });
  });

  it('CA-9, CA-29: si se rechaza con un plan descartado, nada se guarda y el cambio sigue programado', async () => {
    const { checkout, journal } = setup('rechazada', [TEAM, RETIRED]);
    const current = team({ status: 'solo_lectura', pendingPlanId: RETIRED.id });

    const outcome = await checkout.renew(ANA, current, ORDER);

    expect(journal).toEqual(['charge']);
    expect(outcome).toMatchObject({ subscription: current, discardedPlan: null });
  });
});
