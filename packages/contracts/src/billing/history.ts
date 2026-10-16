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

/**
 * `GET /billing/history` (spec 009 CA-7; mockup `billing/suscripcion/`): plan actual del cliente con el esquema del
 * catálogo de la 008 (nulo si aún no tiene fila de suscripción; `expiresAt` nulo en Personal), la tarjeta del último
 * pago aprobado, el correo de la última factura y los pagos, del más reciente al más antiguo. Nunca datos de otra cuenta.
 */
export const billingHistoryResponseSchema = z
  .object({
    subscription: z
      .object({ plan: planSchema, expiresAt: z.string().datetime().nullable() })
      .strict()
      .nullable(),
    paymentMethod: paymentMethodSchema.nullable(),
    receiptEmail: z.string().email().nullable(),
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
export type BillingHistoryPayment = BillingHistoryResponse['payments'][number];
export type InvoiceDownloadResponse = z.infer<typeof invoiceDownloadResponseSchema>;
