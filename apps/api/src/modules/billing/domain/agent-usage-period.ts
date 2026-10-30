import { PAID_PLAN_PERIOD_DAYS } from './entities/subscription.entity';
import type { Subscription } from './entities/subscription.entity';

/** Guatemala no tiene horario de verano: el mes calendario de Personal empieza a las 06:00 UTC del día 1 (P-1). */
export const GUATEMALA_UTC_OFFSET_HOURS = -6;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const PAID_PERIOD_MS = PAID_PLAN_PERIOD_DAYS * DAY_MS;

/** El periodo del contador de consultas: `startsAt` es la clave de la fila de `uso_agente`; `resetsAt`, cuándo vuelve a cero. */
export interface AgentUsagePeriod {
  readonly startsAt: Date;
  /** Nulo en solo lectura: el contador no se reinicia hasta pagar (P-9). */
  readonly resetsAt: Date | null;
}

const guatemalaMonthStart = (year: number, month: number): Date =>
  new Date(Date.UTC(year, month, 1, -GUATEMALA_UTC_OFFSET_HOURS));

const guatemalaMonth = (now: Date): AgentUsagePeriod => {
  const local = new Date(now.getTime() + GUATEMALA_UTC_OFFSET_HOURS * HOUR_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    startsAt: guatemalaMonthStart(year, month),
    resetsAt: guatemalaMonthStart(year, month + 1),
  };
};

/** Pago: `startedAt` en el futuro significa que el siguiente periodo ya se pagó y el actual terminó de correr antes (010 CA-26). */
const paidPeriod = (subscription: Subscription, now: Date): AgentUsagePeriod => {
  const { startedAt, expiresAt } = subscription;
  if (subscription.isReadOnly) return { startsAt: startedAt, resetsAt: null };
  if (startedAt > now) {
    return { startsAt: new Date(startedAt.getTime() - PAID_PERIOD_MS), resetsAt: startedAt };
  }
  return { startsAt: startedAt, resetsAt: expiresAt };
};

/**
 * RN-4 (spec 020; DF-25): en planes de pago, el periodo de la suscripción (se reinicia al renovar); en Personal o sin
 * fila, el mes calendario de Guatemala. Un periodo nuevo es una fila nueva de `uso_agente`: no hay trabajo de reinicio.
 */
export const agentUsagePeriod = (subscription: Subscription | null, now: Date): AgentUsagePeriod =>
  subscription === null || subscription.isPersonal
    ? guatemalaMonth(now)
    : paidPeriod(subscription, now);
