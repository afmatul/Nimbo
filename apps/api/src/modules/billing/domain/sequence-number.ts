/** Prefijo y relleno de un número correlativo `{prefijo}-{año}-{secuencia}` (spec 009 RN-5, plan §3). */
interface SequenceFormat {
  readonly prefix: string;
  readonly digits: number;
}

/** Comprobante de la pasarela simulada (mockup de pago). */
const PAYMENT_REFERENCE: SequenceFormat = { prefix: 'SIM', digits: 6 };
/** Factura de Nimbo (mockup de suscripción). */
const INVOICE_NUMBER: SequenceFormat = { prefix: 'NB', digits: 4 };

/**
 * El año es el del pago y la secuencia no se reinicia al cambiar de año (decisión 5). `padStart` no corta: pasado el
 * relleno el número crece y sigue siendo único.
 */
const formatSequenceNumber = (format: SequenceFormat, year: number, sequence: number): string =>
  `${format.prefix}-${String(year)}-${String(sequence).padStart(format.digits, '0')}`;

export const formatPaymentReference = (year: number, sequence: number): string =>
  formatSequenceNumber(PAYMENT_REFERENCE, year, sequence);

export const formatInvoiceNumber = (year: number, sequence: number): string =>
  formatSequenceNumber(INVOICE_NUMBER, year, sequence);
