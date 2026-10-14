import type { Actor } from '../../../../shared';

/**
 * `suscripcion` bajo RLS forzado (plan 009 §3): todo método toma el `EntityManager` de `requireActorScope(actor)`,
 * así que se llama dentro de `withActor(actor, …)` y solo ve o escribe la fila del propio cliente.
 */
export interface ISubscriptionRepository {
  /** Suscripción Personal sin vencimiento del actor; si ya tiene una, no cambia nada (CA-1, `uq_suscripcion_usuario`). */
  insertPersonalIfAbsent(actor: Actor): Promise<void>;
}

export const I_SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');
