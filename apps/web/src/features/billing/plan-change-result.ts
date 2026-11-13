import type { PlanChangeResponse } from '@nimbo/contracts';

import { numericDayLabel } from '../../lib/format-date';

type PlanChangeResult = PlanChangeResponse['result'];

/**
 * El cambio de plan es un éxito con su fecha: «Tu plan cambiará a Pro el 14/10/2026, en tu próxima fecha de cobro.»
 * Si ya rige (en solo lectura, Personal se aplica al instante, 010 CA-27): «Tu plan cambió a Personal.»
 */
export function planChangeMessage(result: PlanChangeResult, now: number): string {
  if (Date.parse(result.effectiveAt) <= now) return `Tu plan cambió a ${result.planName}.`;
  const day = numericDayLabel(result.effectiveAt);
  return `Tu plan cambiará a ${result.planName} el ${day}, en tu próxima fecha de cobro.`;
}
