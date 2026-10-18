/** Catálogo de códigos de error de `billing` (specs 008, 009, 010 y 011). El dominio de `api` repite el literal (no importa `contracts`, ADR-0008); `web` los usa para sus mensajes. */
export const BILLING_ERROR_CODES = {
  BILLING_PLAN_CATALOG_UNAVAILABLE: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
  /** 011 CA-11: un plan nuevo no cumple las reglas o su nombre ya existe (`fields`, `NAME_TAKEN`). */
  BILLING_PLAN_INVALID: 'BILLING_PLAN_INVALID',
  /** 011 CA-11: Personal no se desactiva. */
  BILLING_PLAN_NOT_DEACTIVATABLE: 'BILLING_PLAN_NOT_DEACTIVATABLE',
  /** 011 CA-10: el plan ya estaba desactivado. */
  BILLING_PLAN_ALREADY_DEACTIVATED: 'BILLING_PLAN_ALREADY_DEACTIVATED',
  /** 009 CA-5: los datos de pago no cumplen RN-9 o la tarjeta venció (`fields`). */
  BILLING_INVALID_INPUT: 'BILLING_INVALID_INPUT',
  /** 009 CA-5: plan inexistente, desactivado, gratuito, o la cuenta ya no está en Personal. */
  BILLING_PLAN_NOT_AVAILABLE: 'BILLING_PLAN_NOT_AVAILABLE',
  /** 009 CA-4: la pasarela rechazó la tarjeta; no hubo cargo. */
  BILLING_PAYMENT_REJECTED: 'BILLING_PAYMENT_REJECTED',
  /** 009 CA-8: la factura no existe, no es del cliente o aún no tiene PDF (sin oráculo). */
  BILLING_INVOICE_NOT_FOUND: 'BILLING_INVOICE_NOT_FOUND',
  /** 010 CA-6, CA-11, CA-18: la operación es de un plan de pago y la cuenta está en Personal. */
  BILLING_NO_PAID_SUBSCRIPTION: 'BILLING_NO_PAID_SUBSCRIPTION',
  /** 010 CA-17: el plan del cambio no existe, está desactivado o es el actual. */
  BILLING_PLAN_CHANGE_INVALID: 'BILLING_PLAN_CHANGE_INVALID',
  /** 010 CA-19: no hay cambio de plan programado. */
  BILLING_NO_PENDING_PLAN_CHANGE: 'BILLING_NO_PENDING_PLAN_CHANGE',
  /** 010 CA-26: el siguiente periodo ya está pagado (o cambió `vence_en` mientras pagaba). */
  BILLING_ALREADY_RENEWED: 'BILLING_ALREADY_RENEWED',
  /** 010 CA-28: con un cambio programado no se renueva por adelantado. */
  BILLING_PLAN_CHANGE_PENDING: 'BILLING_PLAN_CHANGE_PENDING',
} as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];

/**
 * Motivos de campo del cobro que solo la API detecta (009 CA-5), con su mensaje. Fuente única: la capa de aplicación de
 * `billing` (`PaymentService`) y `web` lo leen de aquí; el dominio no lo necesita (ADR-0008).
 */
export const BILLING_FIELD_MESSAGES = {
  CARD_EXPIRED: 'La tarjeta está vencida. Usa una tarjeta con fecha de vencimiento vigente.',
} as const;
