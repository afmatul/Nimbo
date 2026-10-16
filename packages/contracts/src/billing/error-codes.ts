/** Catálogo de códigos de error de `billing` (spec 008). El dominio de `api` repite el literal (no importa `contracts`, ADR-0008); `web` los usa para sus mensajes. */
export const BILLING_ERROR_CODES = {
  BILLING_PLAN_CATALOG_UNAVAILABLE: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
} as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];
