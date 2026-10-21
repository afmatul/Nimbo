/** Una factura sin PDF y su dueño: solo UUID (ADR-0021). */
export interface PendingInvoice {
  readonly invoiceId: string;
  readonly userId: string;
}

/**
 * Único acceso a `factura` sin actor (spec 009 T-07, plan §2): llama a `facturas_pendientes_de_emitir` dentro de
 * `ITransactionRunner.run` y no sale de `billing`, como `IExpiredUploadScanner` de `storage`.
 */
export interface IPendingInvoiceScanner {
  listPending(limit: number): Promise<readonly PendingInvoice[]>;
}

export const I_PENDING_INVOICE_SCANNER = Symbol('IPendingInvoiceScanner');
