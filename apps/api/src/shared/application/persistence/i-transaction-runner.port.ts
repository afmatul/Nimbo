import type { Actor } from '../../domain/actor';

/**
 * Unidad de trabajo transaccional (001 plan §6.7). `run` confirma si `work` termina y revierte y relanza si
 * lanza. Dentro de `work`, los repositorios toman el `EntityManager` de la transacción desde `TransactionContext`,
 * así la aplicación no conoce TypeORM.
 */
export interface ITransactionRunner {
  /**
   * Transacción sin actor, para tablas sin datos de cliente (`usuario`, `token_cuenta`). Dentro de `withActor` se
   * une a esa transacción y conserva el actor.
   */
  run<T>(work: () => Promise<T>): Promise<T>;

  /**
   * Transacción con el actor fijado en la base (003 plan §6.3, ADR-0005): `app.actor_id` y `app.actor_role`, locales
   * a la transacción, que leen las políticas RLS. Reentrante con el mismo actor; con otro actor, o dentro de un
   * `run` sin actor, lanza `ActorScopeConflictError`. Los datos de cliente solo se consultan aquí dentro.
   */
  withActor<T>(actor: Actor, work: () => Promise<T>): Promise<T>;
}

export const I_TRANSACTION_RUNNER = Symbol('I_TRANSACTION_RUNNER');
