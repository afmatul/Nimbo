const PAYMENT_REFERENCE_PREFIX = 'SIM';
const PAYMENT_REFERENCE_DIGITS = 6;

/**
 * Referencia del comprobante de la pasarela simulada (spec 009 RN-5, plan §3): `SIM-{año del pago}-{secuencia}`, con la
 * secuencia rellenada a 6 dígitos. `padStart` no corta: pasado el 999 999 la referencia crece y sigue siendo única.
 */
export const formatPaymentReference = (year: number, sequence: number): string =>
  `${PAYMENT_REFERENCE_PREFIX}-${String(year)}-${String(sequence).padStart(PAYMENT_REFERENCE_DIGITS, '0')}`;
