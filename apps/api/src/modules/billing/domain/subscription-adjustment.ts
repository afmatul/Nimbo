const DAY_MS = 86_400_000;

/** Guatemala no tiene horario de verano: su medianoche son siempre las 06:00 UTC. */
const GUATEMALA_OFFSET = '-06:00';

/**
 * Instante en que deja de regir un día elegido en `America/Guatemala` (`YYYY-MM-DD`, ya validado por el contrato): las
 * 00:00 del día siguiente en Guatemala (011b RN-1, RN-2). Así «hasta hoy» sigue siendo futuro y, mostrado como el
 * último día en que rige (RN-8), se ve el día elegido. Las reglas que dependen del estado viven en SQL (ADR-0035).
 */
export const endOfGuatemalaDay = (day: string): Date =>
  new Date(Date.parse(`${day}T00:00:00.000${GUATEMALA_OFFSET}`) + DAY_MS);
