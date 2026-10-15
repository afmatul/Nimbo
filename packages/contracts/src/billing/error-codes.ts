/** Catálogo de códigos de error de `billing` (specs 008 y 011). El dominio de `api` repite el literal (no importa `contracts`, ADR-0008); `web` los usa para sus mensajes. */
export const BILLING_ERROR_CODES = {
  BILLING_PLAN_CATALOG_UNAVAILABLE: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
  /** 011 CA-11: un plan nuevo no cumple las reglas o su nombre ya existe (`fields`, `NAME_TAKEN`). */
  BILLING_PLAN_INVALID: 'BILLING_PLAN_INVALID',
  /** 011 CA-11: Personal no se desactiva. */
  BILLING_PLAN_NOT_DEACTIVATABLE: 'BILLING_PLAN_NOT_DEACTIVATABLE',
  /** 011 CA-10: el plan ya estaba desactivado. */
  BILLING_PLAN_ALREADY_DEACTIVATED: 'BILLING_PLAN_ALREADY_DEACTIVATED',
} as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];
