import type { SubscriptionView } from '@nimbo/contracts';

import type { SubscriptionSummary } from '../application/subscription-summary';

import { toPlanResponse } from './plan.response';

/**
 * Lista blanca de la suscripción (spec 010 §6, CA-25): fechas en ISO, planes con el contrato del catálogo (008) y la
 * tarjeta solo con marca y últimos 4; nunca la referencia del instrumento (ADR-0031).
 */
export const toSubscriptionView = ({
  plan,
  expiresAt,
  standing,
  autoRenew,
  pendingPlan,
  nextCharge,
  renewal,
}: SubscriptionSummary): SubscriptionView => ({
  plan: toPlanResponse(plan),
  expiresAt: expiresAt?.toISOString() ?? null,
  status: standing,
  autoRenew,
  pendingPlan: pendingPlan === null ? null : toPlanResponse(pendingPlan),
  nextCharge:
    nextCharge === null
      ? null
      : {
          date: nextCharge.date.toISOString(),
          amountCents: nextCharge.plan.priceCents,
          planName: nextCharge.plan.name,
          card:
            nextCharge.card === null
              ? null
              : { brand: nextCharge.card.brand, last4: nextCharge.card.last4 },
        },
  renewal:
    renewal === null
      ? null
      : {
          available: renewal.available,
          unavailableReason: renewal.unavailableReason,
          expectedExpiresAt: renewal.expectedExpiresAt.toISOString(),
          periodStartsAt: renewal.periodStartsAt.toISOString(),
          periodEndsAt: renewal.periodEndsAt.toISOString(),
          amountCents: renewal.plan.priceCents,
          planName: renewal.plan.name,
        },
});
