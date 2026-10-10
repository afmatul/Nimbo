/** Catálogo de códigos de error de `billing` (spec 008). Las clases de `api` los reutilizan (Art. VI). */
export const BILLING_ERROR_CODES = {
  BILLING_PLAN_CATALOG_UNAVAILABLE: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
} as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];
