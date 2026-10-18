import type { Actor } from '../../../../shared';
import type { Subscription } from '../../domain/entities/subscription.entity';

/** Lo que `storage` necesita de la suscripción del actor (plan 010 §2): su plan y si está en solo lectura (RN-5). */
export interface SubscriptionStanding {
  readonly planId: string;
  readonly readOnly: boolean;
}

/**
 * `suscripcion` bajo RLS forzado (plan 009 §3): todo método toma el `EntityManager` de `requireActorScope(actor)`, así
 * que se llama dentro de `withActor(actor, …)` y solo ve o escribe la fila del propio cliente.
 */
export interface ISubscriptionRepository {
  /** Suscripción Personal sin vencimiento del actor; si ya tiene una, no cambia nada (CA-1, `uq_suscripcion_usuario`). */
  insertPersonalIfAbsent(actor: Actor): Promise<void>;
  /** 009 T-03 (PD-80) y 010: plan y estado de la fila del actor, sin candado; `null` sin fila (Personal en los límites). */
  findStanding(actor: Actor): Promise<SubscriptionStanding | null>;
  /** La fila del actor con `FOR UPDATE` (plan §2): dos cobros simultáneos se esperan. Exige que exista. */
  lockCurrent(actor: Actor): Promise<Subscription>;
  /** Guarda plan, periodo, estado, renovación automática y cambio programado de la suscripción del actor. */
  save(actor: Actor, subscription: Subscription): Promise<void>;
}

export const I_SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');
