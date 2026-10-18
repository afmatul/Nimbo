import type { Money } from '../value-objects/money';

/** Lo que el cobro registra de la factura antes de tener id y número (spec 009 CA-6, plan §3, `factura`). */
export interface InvoiceDraft {
  readonly paymentId: string;
  readonly subtotal: Money;
  readonly vat: Money;
  readonly total: Money;
  /** `CF` o de 5 a 12 dígitos (RN-9); solo se guarda aquí. */
  readonly nit: string;
  /** A dónde se manda el comprobante, para que el reintento no necesite a `identity`. */
  readonly receiptEmail: string;
  readonly createdAt: Date;
}

/** Una fila de `factura`: nunca se borra (RN-7). El PDF y el aviso llegan después del commit (T-07, T-08). */
export interface Invoice extends InvoiceDraft {
  readonly id: string;
  readonly userId: string;
  readonly number: string;
}
