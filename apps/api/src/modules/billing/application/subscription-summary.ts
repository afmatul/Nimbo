import type { Plan } from '../domain/entities/plan.entity';
import type { RenewalQuote, Subscription } from '../domain/entities/subscription.entity';

import type { PaymentMethod } from './ports/i-billing-history.reader.port';

const DAY_MS = 86_400_000;

/** Estado de §6 (spec 010): vigente, por vencer (dentro de los días del aviso, RN-8) o en solo lectura. */
export type SubscriptionState = 'active' | 'expiring' | 'readOnly';

/** Lo que cobra la renovación automática al vencer, con la tarjeta del último pago (CA-25). */
export interface NextCharge {
  readonly date: Date;
  readonly plan: Plan;
  readonly card: PaymentMethod | null;
}

/** La renovación manual de ahora (CA-8, CA-26, CA-28) con el plan que cobraría y el `vence_en` que debe enviar. */
export interface ManualRenewal extends RenewalQuote {
  readonly plan: Plan;
  readonly expectedExpiresAt: Date;
}

/** «Plan y facturación» (spec 010 §6, CA-25): en Personal, todo lo de pago es nulo. */
export interface SubscriptionSummary {
  readonly plan: Plan;
  readonly expiresAt: Date | null;
  readonly standing: SubscriptionState;
  readonly autoRenew: boolean;
  readonly pendingPlan: Plan | null;
  readonly nextCharge: NextCharge | null;
  readonly renewal: ManualRenewal | null;
}

/** Lo que se lee para armarla: la suscripción, su plan, el programado (si hay) y la tarjeta del último pago aprobado. */
export interface SubscriptionFacts {
  readonly subscription: Subscription;
  readonly plan: Plan;
  readonly pendingPlan: Plan | null;
  readonly card: PaymentMethod | null;
}

/** Cuándo se considera la suscripción y cuántos días antes de vencer se avisa (RN-8). */
export interface SummaryClock {
  readonly now: Date;
  readonly reminderDays: number;
}

const standingOf = (expiresAt: Date, readOnly: boolean, clock: SummaryClock): SubscriptionState => {
  if (readOnly) return 'readOnly';
  const expiring = expiresAt.getTime() - clock.now.getTime() <= clock.reminderDays * DAY_MS;
  return expiring ? 'expiring' : 'active';
};

/** CA-25: solo hay cobro automático encendido, vigente y hacia un plan de pago (bajar a Personal no cobra, RN-7). */
const nextChargeOf = (
  facts: SubscriptionFacts,
  expiresAt: Date,
  nextPlan: Plan,
): NextCharge | null => {
  const { subscription, card } = facts;
  const charges = subscription.autoRenew && !subscription.isReadOnly && nextPlan.priceCents > 0;
  return charges ? { date: expiresAt, plan: nextPlan, card } : null;
};

/** Resume la suscripción para la vista y para las respuestas de sus cambios (la misma regla de `renewalQuote`). */
export const summarizeSubscription = (
  facts: SubscriptionFacts,
  clock: SummaryClock,
): SubscriptionSummary => {
  const { subscription, plan, pendingPlan } = facts;
  const base = { plan, expiresAt: subscription.expiresAt, autoRenew: subscription.autoRenew };
  if (subscription.isPersonal || subscription.expiresAt === null) {
    return { ...base, standing: 'active', pendingPlan: null, nextCharge: null, renewal: null };
  }
  const expiresAt = subscription.expiresAt;
  const nextPlan = pendingPlan ?? plan;
  return {
    ...base,
    standing: standingOf(expiresAt, subscription.isReadOnly, clock),
    pendingPlan,
    nextCharge: nextChargeOf(facts, expiresAt, nextPlan),
    renewal: {
      ...subscription.renewalQuote(clock.now),
      plan: nextPlan,
      expectedExpiresAt: expiresAt,
    },
  };
};
