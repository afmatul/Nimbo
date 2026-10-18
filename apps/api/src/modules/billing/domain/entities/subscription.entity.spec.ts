import { aPlan, PERSONAL_PLAN } from '../../application/testing/plans';
import { aSubscription } from '../../application/testing/subscriptions';
import { NoPaidSubscriptionError } from '../errors/no-paid-subscription.error';
import { NoPendingPlanChangeError } from '../errors/no-pending-plan-change.error';
import { PlanChangeInvalidError } from '../errors/plan-change-invalid.error';
import { PlanNotAvailableError } from '../errors/plan-not-available.error';

import { PAID_PLAN_PERIOD_DAYS } from './subscription.entity';
import type { SubscriptionProps, Subscription } from './subscription.entity';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const EXPIRES = new Date('2026-10-20T12:00:00.000Z');
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
});
const PRO = aPlan({
  id: '10000000-0000-4000-8000-000000000004',
  slug: 'pro',
  name: 'Pro',
  priceCents: 25_000,
});

const personal = (): Subscription => aSubscription();

const team = (patch: Partial<SubscriptionProps> = {}): Subscription =>
  aSubscription({
    planId: TEAM.id,
    planSlug: TEAM.slug,
    startedAt: new Date('2026-09-20T12:00:00.000Z'),
    expiresAt: EXPIRES,
    ...patch,
  });

const days = (from: Date, count: number): Date => new Date(from.getTime() + count * 86_400_000);

describe('Subscription (spec 009 RN-4, RN-6, CA-3, CA-5)', () => {
  it('RN-4: un plan de pago dura 30 días desde el pago', () => {
    const next = personal().subscribeTo(TEAM, NOW);

    expect(PAID_PLAN_PERIOD_DAYS).toBe(30);
    expect(next).toMatchObject({ planId: TEAM.id, planSlug: 'equipo', startedAt: NOW });
    expect(next.expiresAt).toEqual(new Date('2026-11-13T12:00:00.000Z'));
  });

  it.each([
    ['Personal (gratuito)', PERSONAL_PLAN],
    ['un plan desactivado (RN-6)', TEAM.deactivate(NOW)],
  ])('CA-5: %s no se contrata', (_case, plan) => {
    expect(() => personal().subscribeTo(plan, NOW)).toThrow(PlanNotAvailableError);
  });

  it('CA-5: una cuenta que ya no está en Personal no contrata otro plan (el cambio es de la 010)', () => {
    const paid = personal().subscribeTo(TEAM, NOW);

    expect(() => paid.subscribeTo(TEAM, NOW)).toThrow(PlanNotAvailableError);
  });

  it('010 RN-3: al contratar queda vigente, con renovación automática y sin cambio programado', () => {
    const next = personal().subscribeTo(TEAM, NOW);

    expect(next).toMatchObject({ status: 'vigente', autoRenew: true, pendingPlanId: null });
  });
});

describe('Subscription: renovación y vencimiento (spec 010 RN-1, RN-5, CA-15)', () => {
  it('RN-1: vigente, el periodo nuevo empieza en el `vence_en` anterior y dura 30 días', () => {
    const next = team().renewWith(TEAM, NOW);

    expect(next).toMatchObject({ planId: TEAM.id, startedAt: EXPIRES, status: 'vigente' });
    expect(next.expiresAt).toEqual(days(EXPIRES, PAID_PLAN_PERIOD_DAYS));
  });

  it('RN-1, CA-10: en solo lectura, el periodo nuevo empieza al pagar y la solo lectura termina', () => {
    const late = days(EXPIRES, 2);

    const next = team({ status: 'solo_lectura' }).renewWith(TEAM, late);

    expect(next).toMatchObject({ startedAt: late, status: 'vigente', isReadOnly: false });
    expect(next.expiresAt).toEqual(days(late, PAID_PLAN_PERIOD_DAYS));
  });

  it('RN-4: el plan del siguiente ciclo es el programado si hay uno; si no, el actual', () => {
    expect(team().nextCyclePlanId).toBe(TEAM.id);
    expect(team({ pendingPlanId: PRO.id }).nextCyclePlanId).toBe(PRO.id);
  });

  it('RN-5: vencer deja el mismo plan en solo lectura; `isDue` solo con `vence_en` cumplido y vigente', () => {
    const expired = team().expire();

    expect(expired).toMatchObject({ planId: TEAM.id, expiresAt: EXPIRES, isReadOnly: true });
    expect(team().isDue(NOW)).toBe(false);
    expect(team().isDue(EXPIRES)).toBe(true);
    expect(expired.isDue(days(EXPIRES, 1))).toBe(false);
  });

  it('CA-15: Personal nunca vence ni se renueva', () => {
    expect(personal().isDue(days(NOW, 365))).toBe(false);
    expect(() => personal().expire()).toThrow(NoPaidSubscriptionError);
    expect(() => personal().renewWith(TEAM, NOW)).toThrow(NoPaidSubscriptionError);
  });
});

describe('Subscription: renovación automática (spec 010 RN-3, CA-6)', () => {
  it('CA-6: se apaga y se enciende sin tocar el periodo pagado', () => {
    const off = team().setAutoRenew(false);

    expect(off).toMatchObject({
      autoRenew: false,
      startedAt: team().startedAt,
      expiresAt: EXPIRES,
    });
    expect(off.setAutoRenew(true).autoRenew).toBe(true);
  });

  it('CA-6: con Personal, BILLING_NO_PAID_SUBSCRIPTION', () => {
    expect(() => personal().setAutoRenew(false)).toThrow(NoPaidSubscriptionError);
  });
});

describe('Subscription: cambio de plan (spec 010 RN-7, CA-16 a CA-21, CA-27)', () => {
  it('CA-16: programa un plan de pago o Personal sin tocar plan ni periodo; otro reemplaza al anterior', () => {
    const toPro = team().scheduleChange(PRO, NOW);
    const toPersonal = toPro.scheduleChange(PERSONAL_PLAN, NOW);

    expect(toPro).toMatchObject({ planId: TEAM.id, expiresAt: EXPIRES, pendingPlanId: PRO.id });
    expect(toPersonal.pendingPlanId).toBe(PERSONAL_PLAN.id);
  });

  it.each([
    ['el mismo plan', TEAM],
    ['un plan desactivado', PRO.deactivate(NOW)],
    [
      'un plan gratuito que no es Personal',
      aPlan({ id: 'gratis', slug: 'gratis', name: 'Gratis' }),
    ],
  ])('CA-17: %s es BILLING_PLAN_CHANGE_INVALID', (_case, plan) => {
    expect(() => team().scheduleChange(plan, NOW)).toThrow(PlanChangeInvalidError);
  });

  it('CA-18: desde Personal no hay cambio, BILLING_NO_PAID_SUBSCRIPTION', () => {
    expect(() => personal().scheduleChange(TEAM, NOW)).toThrow(NoPaidSubscriptionError);
  });

  it('CA-19: cancelar quita el cambio; sin cambio, BILLING_NO_PENDING_PLAN_CHANGE', () => {
    expect(team({ pendingPlanId: PRO.id }).cancelChange().pendingPlanId).toBeNull();
    expect(() => team().cancelChange()).toThrow(NoPendingPlanChangeError);
  });

  it('CA-27: en solo lectura, el cambio a Personal se aplica de inmediato y termina la solo lectura', () => {
    const next = team({ status: 'solo_lectura' }).scheduleChange(PERSONAL_PLAN, NOW);

    expect(next).toMatchObject({
      planId: PERSONAL_PLAN.id,
      planSlug: 'personal',
      startedAt: NOW,
      expiresAt: null,
      status: 'vigente',
      pendingPlanId: null,
      isPersonal: true,
    });
  });

  it('CA-21: renovar con el cambio a Personal deja Personal sin vencimiento desde `vence_en`', () => {
    const next = team({ pendingPlanId: PERSONAL_PLAN.id }).renewWith(PERSONAL_PLAN, EXPIRES);

    expect(next).toMatchObject({
      planId: PERSONAL_PLAN.id,
      startedAt: EXPIRES,
      expiresAt: null,
      pendingPlanId: null,
    });
  });

  it('CA-20: renovar con el cambio a un plan de pago abre el periodo nuevo con ese plan', () => {
    const next = team({ pendingPlanId: PRO.id }).renewWith(PRO, EXPIRES);

    expect(next).toMatchObject({ planId: PRO.id, planSlug: 'pro', pendingPlanId: null });
    expect(next.expiresAt).toEqual(days(EXPIRES, PAID_PLAN_PERIOD_DAYS));
  });

  it('RN-4: renovar con un plan que no es el del siguiente ciclo es un error de programación', () => {
    expect(() => team({ pendingPlanId: PRO.id }).renewWith(TEAM, EXPIRES)).toThrow(/RN-4/);
    expect(() => team().renewWith(PRO, EXPIRES)).toThrow(/RN-4/);
  });
});

describe('Subscription.renewalQuote (spec 010 CA-8, CA-10, CA-11, CA-26, CA-28)', () => {
  it('CA-8: vigente y sin cambio, disponible con el periodo que empieza en `vence_en`', () => {
    expect(team().renewalQuote(NOW)).toEqual({
      available: true,
      unavailableReason: null,
      periodStartsAt: EXPIRES,
      periodEndsAt: days(EXPIRES, PAID_PLAN_PERIOD_DAYS),
    });
  });

  it('CA-26: ya renovado por adelantado (el periodo vigente aún no empieza), ALREADY_RENEWED', () => {
    const renewed = team().renewWith(TEAM, NOW);

    expect(renewed.renewalQuote(NOW)).toMatchObject({
      available: false,
      unavailableReason: 'ALREADY_RENEWED',
    });
  });

  it.each([
    ['a Personal', PERSONAL_PLAN.id],
    ['a otro plan de pago', PRO.id],
  ])('CA-28: con un cambio programado %s, PLAN_CHANGE_PENDING', (_case, pendingPlanId) => {
    expect(team({ pendingPlanId }).renewalQuote(NOW)).toMatchObject({
      available: false,
      unavailableReason: 'PLAN_CHANGE_PENDING',
    });
  });

  it('CA-10, CA-20: en solo lectura está disponible desde `now`, aun con un cambio programado', () => {
    const late = days(EXPIRES, 3);

    expect(team({ status: 'solo_lectura', pendingPlanId: PRO.id }).renewalQuote(late)).toEqual({
      available: true,
      unavailableReason: null,
      periodStartsAt: late,
      periodEndsAt: days(late, PAID_PLAN_PERIOD_DAYS),
    });
  });

  it('CA-11: con Personal, BILLING_NO_PAID_SUBSCRIPTION', () => {
    expect(() => personal().renewalQuote(NOW)).toThrow(NoPaidSubscriptionError);
  });
});
