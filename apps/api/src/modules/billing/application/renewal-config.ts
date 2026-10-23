/** Días del aviso previo a `vence_en` (spec 010 RN-8, `RENEWAL_REMINDER_DAYS`): «por vencer» y el aviso por correo. */
export const RENEWAL_REMINDER_DAYS = Symbol('RENEWAL_REMINDER_DAYS');

/**
 * La pasada de renovación del `worker` (`SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES` y `SUBSCRIPTION_RENEWAL_BATCH_SIZE`;
 * plan 010 §2, m-6), como `InvoiceRetryConfig`.
 */
export interface RenewalScheduleConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const RENEWAL_SCHEDULE_CONFIG = Symbol('RENEWAL_SCHEDULE_CONFIG');
