import type { SubscriptionView } from '@nimbo/contracts';

import type { SubscriptionSummary } from '../application/subscription-summary';

import { toPlanResponse } from './plan.response';

type NextChargeView = SubscriptionView['nextCharge'];
type RenewalView = SubscriptionView['renewal'];

/** CA-25: fecha, monto y plan del siguiente cobro; la tarjeta solo con marca y últimos 4. */
const toNextChargeView = (nextCharge: SubscriptionSummary['nextCharge']): NextChargeView => {
  if (nextCharge === null) return null;
  const { date, plan, card } = nextCharge;
  return {
    date: date.toISOString(),
    amountCents: plan.priceCents,
    planName: plan.name,
    card: card === null ? null : { brand: card.brand, last4: card.last4 },
  };
};

/** CA-8, CA-26, CA-28: si se puede renovar ahora, el periodo nuevo y su monto. */
const toRenewalView = (renewal: SubscriptionSummary['renewal']): RenewalView => {
  if (renewal === null) return null;
  return {
    available: renewal.available,
    unavailableReason: renewal.unavailableReason,
    expectedExpiresAt: renewal.expectedExpiresAt.toISOString(),
    periodStartsAt: renewal.periodStartsAt.toISOString(),
    periodEndsAt: renewal.periodEndsAt.toISOString(),
    plan: toPlanResponse(renewal.plan),
  };
};

/**
 * Lista blanca de la suscripción (spec 010 §6, CA-25): fechas en ISO, planes con el contrato del catálogo (008) y la
 * tarjeta solo con marca y últimos 4; nunca la referencia del instrumento (ADR-0031).
 */
export const toSubscriptionView = (summary: SubscriptionSummary): SubscriptionView => ({
  plan: toPlanResponse(summary.plan),
  expiresAt: summary.expiresAt?.toISOString() ?? null,
  status: summary.standing,
  autoRenew: summary.autoRenew,
  pendingPlan: summary.pendingPlan === null ? null : toPlanResponse(summary.pendingPlan),
  pendingPlanDiscarded: summary.pendingPlanDiscarded,
  nextCharge: toNextChargeView(summary.nextCharge),
  renewal: toRenewalView(summary.renewal),
});
