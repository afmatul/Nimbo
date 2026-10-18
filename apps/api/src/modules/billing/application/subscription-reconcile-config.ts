/** Configuración de la conciliación de suscripciones (`SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES` y `_BATCH_SIZE`). */
export interface SubscriptionReconcileConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const SUBSCRIPTION_RECONCILE_CONFIG = Symbol('SUBSCRIPTION_RECONCILE_CONFIG');
