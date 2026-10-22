import {
  renewRequestSchema,
  subscribeRequestSchema,
  type RenewRequest,
  type SubscribeRequest,
} from '@nimbo/contracts';
import type { z } from 'zod';

/** Lo que escribe el cliente (mockup de pago): número con o sin espacios, vencimiento `MM/AA`, CVC y NIT. */
export interface PaymentFormValues {
  readonly number: string;
  readonly expiry: string;
  readonly cvc: string;
  readonly nit: string;
}

export type PaymentField = keyof PaymentFormValues;

export interface PaymentFieldIssue {
  readonly field: PaymentField;
  readonly message: string;
}

/** El cuerpo listo para enviar, o los campos con su error (contratar en la 009, renovar en la 010). */
export type PaymentRequestResult<T> =
  | { readonly ok: true; readonly request: T }
  | { readonly ok: false; readonly issues: readonly PaymentFieldIssue[] };

export type SubscribeRequestResult = PaymentRequestResult<SubscribeRequest>;

export const EMPTY_PAYMENT_FORM: PaymentFormValues = { number: '', expiry: '', cvc: '', nit: 'CF' };

const EXPIRY = /^(\d{1,2})\s*\/\s*(\d{2})$/;
const CENTURY = 2000;
const EXPIRY_FORMAT_MESSAGE = 'Escribe el vencimiento como MM/AA.';
const SPACES = /\s+/g;

const CARD_DIGITS = 16;
const CARD_GROUP = /(\d{4})(?=\d)/g;
const NON_DIGITS = /\D/g;

/** «4242424242» → «4242 4242 42» (mockup): solo dígitos, como máximo 16, en grupos de 4 mientras se escribe. */
export function groupCardNumber(raw: string): string {
  return raw.replace(NON_DIGITS, '').slice(0, CARD_DIGITS).replace(CARD_GROUP, '$1 ');
}

/**
 * Marca de la tarjeta (mockup), con el mismo vocabulario que la API (`visa`, `transaccion.marca_tarjeta`): las dos de
 * prueba (RN-3) empiezan con 4; otra, ninguna. La pantalla decide cómo escribirla.
 */
export function cardBrandOf(number: string): 'visa' | null {
  return number.trimStart().startsWith('4') ? 'visa' : null;
}

/** Campo del formulario de cada campo del contrato (RN-9); los que no se escriben aquí no tienen campo. */
const FORM_FIELDS: Readonly<Record<string, PaymentField>> = {
  'card.number': 'number',
  'card.expMonth': 'expiry',
  'card.expYear': 'expiry',
  'card.cvc': 'cvc',
  nit: 'nit',
};

export const formFieldOf = (apiField: string): PaymentField | undefined => FORM_FIELDS[apiField];

/** La tarjeta y el NIT tal como los esperan los contratos (RN-9): número sin espacios, vencimiento y NIT en mayúsculas. */
type PaymentFields = Pick<SubscribeRequest, 'card' | 'nit'>;

/**
 * Convierte lo escrito con `build` y lo valida con el mismo esquema que la API (RN-9, ADR-0020): un dato inválido no
 * sale del navegador. El vencimiento ya pasado lo rechaza la API con su reloj.
 */
function toPaymentRequest<T>(
  values: PaymentFormValues,
  schema: z.ZodType<T>,
  build: (fields: PaymentFields) => unknown,
): PaymentRequestResult<T> {
  const expiry = EXPIRY.exec(values.expiry.trim());
  if (expiry === null)
    return { ok: false, issues: [{ field: 'expiry', message: EXPIRY_FORMAT_MESSAGE }] };
  const parsed = schema.safeParse(
    build({
      card: {
        number: values.number.replace(SPACES, ''),
        expMonth: Number(expiry[1]),
        expYear: CENTURY + Number(expiry[2]),
        cvc: values.cvc.trim(),
      },
      nit: values.nit.trim().toUpperCase(),
    }),
  );
  if (parsed.success) return { ok: true, request: parsed.data };
  const issues = parsed.error.issues.flatMap((issue) => {
    const field = formFieldOf(issue.path.join('.'));
    return field === undefined ? [] : [{ field, message: issue.message }];
  });
  return { ok: false, issues };
}

/** `POST /billing/subscribe` (009 CA-3 a CA-5). */
export const toSubscribeRequest = (
  planSlug: string,
  values: PaymentFormValues,
): SubscribeRequestResult =>
  toPaymentRequest(values, subscribeRequestSchema, (fields) => ({ planSlug, ...fields }));

/** `POST /billing/renew` (010 CA-8, CA-26): con el `vence_en` que el cliente vio en la pantalla. */
export const toRenewRequest = (
  expectedExpiresAt: string,
  values: PaymentFormValues,
): PaymentRequestResult<RenewRequest> =>
  toPaymentRequest(values, renewRequestSchema, (fields) => ({ ...fields, expectedExpiresAt }));
