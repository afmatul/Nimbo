import type { Actor } from '../../../../shared';
import type { Subscription } from '../../domain/entities/subscription.entity';

/**
 * Lo que `storage` necesita de la suscripción del actor (plan 010 §2): su plan, si está en solo lectura (RN-5) y, desde
 * la 011b, el extra de cuota guardado tal cual (`0` y `null` sin extra); si sigue vigente lo decide el adaptador (RN-1).
 */
export interface SubscriptionStanding {
  readonly planId: string;
  readonly readOnly: boolean;
  readonly extraQuotaBytes: bigint;
  readonly extraQuotaUntil: Date | null;
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
  /** 010 CA-25: la fila del actor sin candado, para la vista; `null` sin fila. */
  findCurrent(actor: Actor): Promise<Subscription | null>;
  /** La fila del actor con `FOR UPDATE` (plan §2): dos cobros simultáneos se esperan. Exige que exista. */
  lockCurrent(actor: Actor): Promise<Subscription>;
  /** Guarda plan, periodo, estado, renovación automática y cambio programado de la suscripción del actor. */
  save(actor: Actor, subscription: Subscription): Promise<void>;
  /** 010 CA-5 (m-5): se envió el aviso previo del periodo que vence en `expiresAt`. */
  markReminderSent(actor: Actor, expiresAt: Date): Promise<void>;
  /** 010 CA-2, CA-7 (m-5): se envió el correo de vencida de `expiresAt`; la pasada deja de listarla (M-3). */
  markExpiredNoticeSent(actor: Actor, expiresAt: Date): Promise<void>;
}

export const I_SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');
