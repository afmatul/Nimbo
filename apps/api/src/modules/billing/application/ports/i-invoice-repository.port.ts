import type { Actor } from '../../../../shared';
import type { Invoice, InvoiceDraft } from '../../domain/entities/invoice.entity';

/**
 * `factura` bajo RLS forzado (plan 009 §3): toma el `EntityManager` de `requireActorScope(actor)`, así que la fila entra
 * en la transacción del cobro (`withActor`).
 */
export interface IInvoiceRepository {
  /** Inserta la factura con el siguiente número `NB-` de la secuencia; el trigger exige que sea del dueño del pago. */
  record(actor: Actor, draft: InvoiceDraft): Promise<Invoice>;
}

export const I_INVOICE_REPOSITORY = Symbol('IInvoiceRepository');
