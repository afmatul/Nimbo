import { z } from 'zod';

/**
 * Las dos tarjetas del simulador de pagos (spec 009 RN-3), sin espacios: la primera aprueba siempre y la segunda
 * rechaza siempre. Las usan el simulador de `api`, la validación del cobro y el formulario de `web`.
 */
export const TEST_CARDS = Object.freeze({
  approved: '4242424242424242',
  rejected: '4000000000000002',
});

const CARD_NUMBER = /^\d{16}$/;
const CVC = /^\d{3}$/;
/** `CF` (consumidor final) o de 5 a 12 dígitos (RN-9). */
const NIT = /^(CF|\d{5,12})$/;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;
const MIN_EXP_YEAR = 2000;
const MAX_EXP_YEAR = 2100;
const SLUG_MAX_LENGTH = 50;

const isTestCard = (number: string): boolean =>
  number === TEST_CARDS.approved || number === TEST_CARDS.rejected;

/** RN-9: la tarjeta de prueba; el vencimiento pasado lo rechaza la API con su reloj. */
const cardSchema = z
  .object({
    number: z
      .string()
      .regex(CARD_NUMBER, 'Escribe los 16 dígitos de la tarjeta, sin espacios.')
      .refine(isTestCard, {
        message: 'Usa una tarjeta de prueba: 4242 4242 4242 4242 o 4000 0000 0000 0002.',
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

/** `POST /billing/subscribe` (spec 009 CA-3 a CA-5, RN-9). Cualquier otra forma es `422` con `fields`. */
export const subscribeRequestSchema = z
  .object({
    planSlug: z.string().min(1).max(SLUG_MAX_LENGTH),
    card: cardSchema,
    nit: z.string().regex(NIT, 'Escribe CF o un NIT de 5 a 12 dígitos, sin guiones.'),
  })
  .strict();

const cents = z.number().int().nonnegative();

/** Pago aprobado (CA-3): referencia `SIM-`, plan contratado, vencimiento y desglose de RN-2, en centavos. */
export const subscribeResponseSchema = z
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
export type SubscribeResponse = z.infer<typeof subscribeResponseSchema>;
