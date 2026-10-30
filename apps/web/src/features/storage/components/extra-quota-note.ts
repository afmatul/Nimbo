import { formatBytes, type SpaceSummaryResponse } from '@nimbo/contracts';

/**
 * 011b CA-5: «Tu cuota incluye 50 GB extra hasta el <día>.», con el último día en que rige el extra (RN-8) en el formato
 * de quien la muestra. Sin extra vigente, `null`: al vencer, la API ya no lo da y la nota desaparece (RN-1).
 */
export function extraQuotaNote(
  { extraQuotaBytes, extraQuotaUntil }: SpaceSummaryResponse,
  lastDayOf: (endIso: string) => string,
): string | null {
  if (extraQuotaBytes <= 0 || extraQuotaUntil === null) return null;
  return `Tu cuota incluye ${formatBytes(extraQuotaBytes)} extra hasta el ${lastDayOf(extraQuotaUntil)}.`;
}
