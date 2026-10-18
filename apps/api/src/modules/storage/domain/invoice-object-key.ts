const INVOICE_PREFIX = 'invoices';
/** `invoices/{usuario}/{factura}.pdf`, solo UUID: el único prefijo que el servidor escribe por su cuenta (009). */
const INVOICE_OBJECT_KEY = /^invoices\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

/**
 * Clave de la factura PDF en MinIO (spec 009, decisión 1): fuera del prefijo `u/` de los archivos de cliente. Fuente
 * única del formato: `billing` la arma con esto y `IObjectStorage.putObject` solo acepta claves que cumplan
 * `isInvoiceObjectKey` (revisión del PR #62, #6).
 */
export const invoiceObjectKey = (userId: string, invoiceId: string): string =>
  `${INVOICE_PREFIX}/${userId}/${invoiceId}.pdf`;

export const isInvoiceObjectKey = (key: string): boolean => INVOICE_OBJECT_KEY.test(key);
