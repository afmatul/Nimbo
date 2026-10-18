import type { Actor } from '../../../../shared';
import type { Subscription } from '../../domain/entities/subscription.entity';

/**
 * `suscripcion` bajo RLS forzado (plan 009 §3): todo método toma el `EntityManager` de `requireActorScope(actor)`, así
 * que se llama dentro de `withActor(actor, …)` y solo ve o escribe la fila del propio cliente.
 */
export interface ISubscriptionRepository {
  /** Suscripción Personal sin vencimiento del actor; si ya tiene una, no cambia nada (CA-1, `uq_suscripcion_usuario`). */
  insertPersonalIfAbsent(actor: Actor): Promise<void>;
  /** T-03 (PD-80): el plan de la fila del actor, sin candado; `null` si aún no tiene fila (Personal en los límites). */
  findCurrentPlanId(actor: Actor): Promise<string | null>;
  /** La fila del actor con `FOR UPDATE` (plan §2): dos cobros simultáneos se esperan. Exige que exista. */
  lockCurrent(actor: Actor): Promise<Subscription>;
  /** Guarda plan, inicio y vencimiento de la suscripción del actor (CA-3). */
  save(actor: Actor, subscription: Subscription): Promise<void>;
}

export const I_SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');
