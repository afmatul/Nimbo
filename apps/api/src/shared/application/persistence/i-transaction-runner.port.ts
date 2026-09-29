/**
 * Unidad de trabajo transaccional (001 plan §6.7). `run` confirma si `work` termina y revierte y relanza si
 * lanza. Dentro de `work`, los repositorios toman el `EntityManager` de la transacción desde `TransactionContext`,
 * así la aplicación no conoce TypeORM. `withActor` (003) se construye encima.
 */
export interface ITransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const I_TRANSACTION_RUNNER = Symbol('I_TRANSACTION_RUNNER');
