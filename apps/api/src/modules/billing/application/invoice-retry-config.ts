/** Configuración del reintento de facturas (`INVOICE_RETRY_INTERVAL_MINUTES` e `INVOICE_RETRY_BATCH_SIZE`). */
export interface InvoiceRetryConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const INVOICE_RETRY_CONFIG = Symbol('INVOICE_RETRY_CONFIG');
