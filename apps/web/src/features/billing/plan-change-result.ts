import type { PlanChangeResponse } from '@nimbo/contracts';

import { numericDayLabel } from '../../lib/format-date';

type PlanChangeResult = PlanChangeResponse['result'];

/**
 * Confirmación del cambio de plan según el `kind` que devuelve la API: programado, «Tu plan cambiará a Pro el
 * 14/10/2026, en tu próxima fecha de cobro.»; aplicado al instante (en solo lectura, bajar a Personal, 010 CA-27),
 * «Tu plan cambió a Personal.»
 */
export function planChangeMessage(result: PlanChangeResult): string {
  if (result.kind === 'APPLIED_IMMEDIATELY') return `Tu plan cambió a ${result.planName}.`;
  const day = numericDayLabel(result.effectiveAt);
  return `Tu plan cambiará a ${result.planName} el ${day}, en tu próxima fecha de cobro.`;
}
