import { z } from 'zod';

import { planSchema } from './schemas';

const cents = z.number().int().positive();

/** La factura de un pago aprobado (CA-7): `downloadable` es falso mientras su PDF no exista (sin enlace). */
const historyInvoiceSchema = z
  .object({
    id: z.string().uuid(),
    number: z.string().min(1),
    downloadable: z.boolean(),
  })
  .strict();

/** Un pago del historial (CA-7): fecha, referencia `SIM-`, plan, monto, estado y su factura (si se aprobó). */
const historyPaymentSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    reference: z.string().min(1),
    planName: z.string().min(1),
    amountCents: cents,
    status: z.enum(['aprobada', 'rechazada']),
    invoice: historyInvoiceSchema.nullable(),
  })
  .strict();

/** Tarjeta del último pago aprobado (CA-7): solo marca y últimos 4 dígitos (RN-9: nunca el número ni el CVC). */
const paymentMethodSchema = z
  .object({ brand: z.string().min(1), last4: z.string().regex(/^\d{4}$/) })
  .strict();

/** Lo que cobra la renovación automática al vencer (010 CA-25): nulo si está apagada, vencida o baja a Personal. */
const nextChargeSchema = z
  .object({
    date: z.string().datetime(),
    amountCents: cents,
    planName: z.string().min(1),
    card: paymentMethodSchema.nullable(),
  })
  .strict();

/**
 * Renovación manual (010 CA-8, CA-10, CA-26, CA-28): si se ofrece «Renovar ahora», por qué no, el `vence_en` que el
 * pago debe enviar, el periodo y el plan que cobraría (el del siguiente ciclo, RN-4 y CA-29: la web no lo recalcula).
 */
const renewalSchema = z
  .object({
    available: z.boolean(),
    unavailableReason: z.enum(['ALREADY_RENEWED', 'PLAN_CHANGE_PENDING']).nullable(),
    expectedExpiresAt: z.string().datetime(),
    periodStartsAt: z.string().datetime(),
    periodEndsAt: z.string().datetime(),
    plan: planSchema,
  })
  .strict();

/**
 * La suscripción del cliente para «Plan y facturación» (spec 010 §6, CA-25): plan, vencimiento, estado (`expiring` en
 * los días del aviso previo, RN-8), renovación automática, cambio programado, próximo cobro y renovación manual. En
 * Personal todo lo de pago es nulo. Nunca la referencia del instrumento (ADR-0031).
 */
export const subscriptionViewSchema = z
  .object({
    plan: planSchema,
    expiresAt: z.string().datetime().nullable(),
    status: z.enum(['active', 'expiring', 'readOnly']),
    autoRenew: z.boolean(),
    pendingPlan: planSchema.nullable(),
    /** CA-29: el plan programado se desactivó; al vencer se descarta y se renueva con `plan`. */
    pendingPlanDiscarded: z.boolean(),
    nextCharge: nextChargeSchema.nullable(),
    renewal: renewalSchema.nullable(),
  })
  .strict();

/**
 * `PUT /billing/subscription/plan-change` (spec 010 CA-16 a CA-18, CA-27): la vista nueva y el resultado que confirma
 * la web. Siempre `200`: el plan elegido rige desde `effectiveAt`, la próxima fecha de cobro (o, si en solo lectura se
 * bajó a Personal y se aplicó ya, el inicio del periodo nuevo).
 */
export const planChangeResponseSchema = z
  .object({
    subscription: subscriptionViewSchema,
    result: z
      .object({
        kind: z.literal('SCHEDULED_FOR_NEXT_BILLING'),
        planSlug: z.string(),
        planName: z.string(),
        effectiveAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

/** Datos de la última factura (CA-7): el NIT (`CF` o dígitos, RN-9) y el correo donde llegan las facturas. */
const billingDetailsSchema = z
  .object({ nit: z.string().min(1), receiptEmail: z.string().email() })
  .strict();

/**
 * `GET /billing/history` (spec 009 CA-7; mockup `billing/suscripcion/`): la suscripción del cliente (010
 * `subscriptionViewSchema`; nula si aún no tiene fila de suscripción), la tarjeta del último
 * pago aprobado, el NIT y el correo de la última factura y los pagos, del más reciente al más antiguo. Nunca datos de otra cuenta.
 */
export const billingHistoryResponseSchema = z
  .object({
    subscription: subscriptionViewSchema.nullable(),
    paymentMethod: paymentMethodSchema.nullable(),
    billingDetails: billingDetailsSchema.nullable(),
    payments: z.array(historyPaymentSchema),
  })
  .strict();

/** `GET /billing/invoices/:id/download` (spec 009 CA-8): enlace temporal al PDF, válido `expiresInSeconds`. */
export const invoiceDownloadResponseSchema = z
  .object({
    downloadUrl: z.string().url(),
    expiresInSeconds: z.number().int().positive(),
  })
  .strict();

export type BillingHistoryResponse = z.infer<typeof billingHistoryResponseSchema>;
export type SubscriptionView = z.infer<typeof subscriptionViewSchema>;
export type PlanChangeResponse = z.infer<typeof planChangeResponseSchema>;
export type BillingHistoryPayment = BillingHistoryResponse['payments'][number];
export type InvoiceDownloadResponse = z.infer<typeof invoiceDownloadResponseSchema>;
