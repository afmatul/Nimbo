import { z } from 'zod';

/**
 * Las tres tarjetas del simulador de pagos, sin espacios: la primera aprueba siempre, la segunda rechaza siempre (spec
 * 009 RN-3) y la tercera aprueba con el cliente presente y se rechaza en la renovación automática (spec 010 RN-2, B-2).
 * Las usan el simulador de `api`, la validación del cobro y el formulario de `web`.
 */
export const TEST_CARDS = Object.freeze({
  approved: '4242424242424242',
  rejected: '4000000000000002',
  recurringDeclined: '4000000000000341',
});

const TEST_CARD_NUMBERS: ReadonlySet<string> = new Set(Object.values(TEST_CARDS));

const CARD_NUMBER = /^\d{16}$/;
const CVC = /^\d{3}$/;
/** `CF` (consumidor final) o de 5 a 12 dígitos (RN-9). */
const NIT = /^(CF|\d{5,12})$/;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;
const MIN_EXP_YEAR = 2000;
const MAX_EXP_YEAR = 2100;
const SLUG_MAX_LENGTH = 50;

const isTestCard = (number: string): boolean => TEST_CARD_NUMBERS.has(number);

/** RN-9: la tarjeta de prueba; el vencimiento pasado lo rechaza la API con su reloj. Contratar y renovar la usan. */
const cardSchema = z
  .object({
    number: z
      .string()
      .regex(CARD_NUMBER, 'Escribe los 16 dígitos de la tarjeta, sin espacios.')
      .refine(isTestCard, {
        message:
          'Usa una tarjeta de prueba: 4242 4242 4242 4242, 4000 0000 0000 0002 o 4000 0000 0000 0341.',
        params: { reason: 'CARD_NOT_ACCEPTED' },
      }),
    expMonth: z
      .number()
      .int()
      .min(FIRST_MONTH, 'Elige un mes del 1 al 12.')
      .max(LAST_MONTH, 'Elige un mes del 1 al 12.'),
    expYear: z
      .number()
      .int()
      .min(MIN_EXP_YEAR, 'Escribe el año con cuatro dígitos.')
      .max(MAX_EXP_YEAR, 'Escribe el año con cuatro dígitos.'),
    cvc: z.string().regex(CVC, 'El CVC son los 3 dígitos del reverso.'),
  })
  .strict();

const nitSchema = z.string().regex(NIT, 'Escribe CF o un NIT de 5 a 12 dígitos, sin guiones.');

/** `POST /billing/subscribe` (spec 009 CA-3 a CA-5, RN-9). Cualquier otra forma es `422` con `fields`. */
export const subscribeRequestSchema = z
  .object({
    planSlug: z.string().min(1).max(SLUG_MAX_LENGTH),
    card: cardSchema,
    nit: nitSchema,
  })
  .strict();

/**
 * `POST /billing/renew` (spec 010 CA-8 a CA-11, CA-26): la tarjeta y el NIT como al contratar, y el `vence_en` que vio
 * el cliente; si cambió mientras pagaba, `409 BILLING_ALREADY_RENEWED` sin cobro (RN-9).
 */
export const renewRequestSchema = z
  .object({
    card: cardSchema,
    nit: nitSchema,
    expectedExpiresAt: z.string().datetime(),
  })
  .strict();

/** `PUT /billing/subscription/auto-renew` (spec 010 CA-6). */
export const autoRenewRequestSchema = z.object({ enabled: z.boolean() }).strict();

/** `PUT /billing/subscription/plan-change` (spec 010 CA-16 a CA-18): el plan del siguiente ciclo, por `slug`. */
export const planChangeRequestSchema = z
  .object({ planSlug: z.string().min(1).max(SLUG_MAX_LENGTH) })
  .strict();

const cents = z.number().int().nonnegative();

/**
 * Pago aprobado al contratar (009 CA-3) o al renovar (010 CA-8, CA-10): referencia `SIM-`, plan del periodo,
 * vencimiento nuevo y desglose de RN-2, en centavos.
 */
export const paymentReceiptSchema = z
  .object({
    reference: z.string(),
    plan: z.object({ slug: z.string(), name: z.string() }).strict(),
    expiresAt: z.string().datetime(),
    amounts: z.object({ subtotalCents: cents, vatCents: cents, totalCents: cents }).strict(),
    /** CA-6: a dónde se envió el comprobante. */
    receiptEmail: z.string().email(),
  })
  .strict();

export type SubscribeRequest = z.infer<typeof subscribeRequestSchema>;
export type RenewRequest = z.infer<typeof renewRequestSchema>;
export type AutoRenewRequest = z.infer<typeof autoRenewRequestSchema>;
export type PlanChangeRequest = z.infer<typeof planChangeRequestSchema>;
export type PaymentReceipt = z.infer<typeof paymentReceiptSchema>;
export type SubscribeResponse = PaymentReceipt;
export type RenewResponse = PaymentReceipt;
