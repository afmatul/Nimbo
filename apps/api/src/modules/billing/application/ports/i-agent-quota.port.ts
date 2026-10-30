import type { Actor } from '../../../../shared';

/** Lo que el contador sabe del periodo actual del actor (spec 020 CA-10). */
export interface AgentQuotaStatus {
  readonly used: number;
  /** `Plan.limits.agentQueriesPerMonth` del plan de quien pregunta (RN-3). */
  readonly limit: number;
  /** Nulo en solo lectura: no se reinicia hasta pagar (P-9). */
  readonly resetsAt: Date | null;
}

/** La consulta reservada; `release` la devuelve a la misma fila aunque el periodo haya cambiado entretanto (RN-5). */
export interface AgentQuotaReservation {
  readonly periodStartsAt: Date;
}

/** CA-11 y CA-12: `granted` ya contó la consulta; `exhausted` no tocó el contador. */
export type AgentQuotaReserveResult =
  | ({
      readonly outcome: 'granted';
      readonly reservation: AgentQuotaReservation;
    } & AgentQuotaStatus)
  | ({ readonly outcome: 'exhausted' } & Omit<AgentQuotaStatus, 'used'>);

/**
 * Consultas del agente por periodo (spec 020 D-4; PD-18, DF-27). Lo **declara e implementa** `billing` y lo consume
 * `intelligence` desde `billing/index.ts`. Devuelve resultados y no lanza errores de `billing`: el 429 lo arma el
 * agente. `reserve` se confirma antes del streaming; `release` resta 1 si la pregunta falla antes de entregarse.
 */
export interface IAgentQuota {
  reserve(actor: Actor): Promise<AgentQuotaReserveResult>;
  release(actor: Actor, reservation: AgentQuotaReservation): Promise<void>;
  status(actor: Actor): Promise<AgentQuotaStatus>;
}

export const I_AGENT_QUOTA = Symbol('IAgentQuota');
