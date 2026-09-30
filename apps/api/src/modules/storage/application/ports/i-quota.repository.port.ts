import type { Actor } from '../../../../shared';
import type { QuotaUsage } from '../../domain/quota-policy';

/**
 * Espacio del actor (plan §6 «Puertos», D-5). Es el **único** punto de `storage` que toca `usuario`, y solo su
 * columna `espacio_usado` (excepción DF-59): `SELECT espacio_usado … FOR UPDATE` y
 * `UPDATE usuario SET espacio_usado = espacio_usado + $1`. Cada método toma el `EntityManager` de
 * `TransactionContext.requireActorScope(actor)`: sin `withActor(actor)` lanza `ActorScopeMissingError`.
 */
export interface IQuotaRepository {
  /** Bloquea la fila del actor (`FOR UPDATE`) y devuelve lo usado, sin sumar reservas. Lo usa `complete`. */
  lockUsage(actor: Actor): Promise<bigint>;
  /**
   * `lockUsage` más la suma de las cargas `activa` con `expira_en > now` (la reserva, RN-13). Lo usa `init`: el
   * bloqueo serializa dos inicios concurrentes del mismo propietario (CA-23).
   */
  lockAndReadUsage(actor: Actor, now: Date): Promise<QuotaUsage>;
  /** Suma `deltaBytes` a `espacio_usado` del actor; ninguna otra columna cambia. */
  addUsedBytes(actor: Actor, deltaBytes: bigint): Promise<void>;
}

export const I_QUOTA_REPOSITORY = Symbol('IQuotaRepository');
