/**
 * Datos de la tarjeta que el cobro necesita (spec 009 RN-9). El CVC no entra al dominio: la validación de la solicitud
 * lo comprueba y el simulador no lo usa. Nunca se guarda el número completo (RN-3).
 */
export interface PaymentCard {
  readonly number: string;
  readonly expMonth: number;
  readonly expYear: number;
}

const LAST_DIGITS = 4;
const MONTHS_PER_YEAR = 12;

/** RN-9: la tarjeta vale hasta el último día de su mes de vencimiento (UTC). */
export const isCardExpired = (card: PaymentCard, now: Date): boolean =>
  card.expYear * MONTHS_PER_YEAR + card.expMonth <
  now.getUTCFullYear() * MONTHS_PER_YEAR + (now.getUTCMonth() + 1);

/** RN-3: lo único que se conserva del número. */
export const lastFourOf = (card: PaymentCard): string => card.number.slice(-LAST_DIGITS);
