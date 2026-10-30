import type { Actor } from '../../../../shared';

/** La fila `(usuario_id, periodo_inicio)` que se reserva y el límite que no puede superar (CA-12). */
export interface ReserveInput {
  readonly periodStartsAt: Date;
  readonly limit: number;
}

/**
 * `uso_agente` bajo RLS forzada (plan 020 §3): todo método toma el `EntityManager` de `requireActorScope(actor)`, así
 * que se llama dentro de `withActor(actor, …)` y solo ve o escribe la fila del propio cliente.
 */
export interface IAgentUsageRepository {
  /** Suma 1 en una sola sentencia si no llega al límite y devuelve el nuevo total; `null` si estaba agotada. */
  reserveOne(actor: Actor, input: ReserveInput): Promise<number | null>;
  /** Resta 1 de la fila de `periodStartsAt`, sin bajar de cero. */
  releaseOne(actor: Actor, periodStartsAt: Date): Promise<void>;
  /** Consultas usadas en el periodo; 0 sin fila. */
  read(actor: Actor, periodStartsAt: Date): Promise<number>;
}

export const I_AGENT_USAGE_REPOSITORY = Symbol('IAgentUsageRepository');
