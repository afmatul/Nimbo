import { subscriptionViewSchema } from '@nimbo/contracts';
import { z } from 'zod';

import { numericDayLabel } from '../../lib/format-date';

/** El cambio no es inmediato: se aplica en la próxima fecha de cobro (éxito, no error). */
export const SCHEDULED_FOR_NEXT_BILLING = 'SCHEDULED_FOR_NEXT_BILLING';

/**
 * Respuesta de `PUT /billing/subscription/plan-change`: la vista nueva y qué pasó con el cambio.
 * TODO(contracts): reemplazar por el esquema que publique `@nimbo/contracts` (acordado con el backend, 2026-11-13).
 */
export const planChangeResponseSchema = z.object({
  subscription: subscriptionViewSchema,
  result: z.object({
    kind: z.string(),
    planSlug: z.string(),
    planName: z.string(),
    effectiveAt: z.string(),
  }),
});

export type PlanChangeResponse = z.infer<typeof planChangeResponseSchema>;
export type PlanChangeResult = PlanChangeResponse['result'];

/** «Tu plan cambiará a Pro el 14/10/2026, en tu próxima fecha de cobro.» o, si ya se aplicó, «Tu plan cambió a …». */
export function planChangeMessage(result: PlanChangeResult): string {
  if (result.kind !== SCHEDULED_FOR_NEXT_BILLING) return `Tu plan cambió a ${result.planName}.`;
  const day = numericDayLabel(result.effectiveAt);
  return `Tu plan cambiará a ${result.planName} el ${day}, en tu próxima fecha de cobro.`;
}
