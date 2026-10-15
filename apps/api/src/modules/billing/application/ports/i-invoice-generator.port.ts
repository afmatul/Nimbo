/** Lo que imprime la factura (spec 009 CA-6, RN-2, RN-5): datos planos, sin entidades ni montos con formato. */
export interface InvoiceDocument {
  readonly number: string;
  /** Fecha del pago: el PDF no depende del reloj, así el reintento repone el mismo archivo. */
  readonly issuedAt: Date;
  readonly planName: string;
  readonly paymentReference: string;
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly nit: string;
  readonly receiptEmail: string;
}

/** Generador de la factura PDF (M4, `architecture.md` §5). Lo implementa `pdfkit` (ADR-0028). */
export interface IInvoiceGenerator {
  generate(document: InvoiceDocument): Promise<Buffer>;
}

export const I_INVOICE_GENERATOR = Symbol('IInvoiceGenerator');
