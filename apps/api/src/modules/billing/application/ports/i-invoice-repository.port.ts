import type { Actor } from '../../../../shared';
import type { Invoice, InvoiceDraft } from '../../domain/entities/invoice.entity';

import type { InvoiceDocument } from './i-invoice-generator.port';

/** Una factura lista para emitir: su pago, su PDF y su aviso (nulos hasta que existan) y lo que imprime. */
export interface IssuableInvoice {
  readonly id: string;
  readonly paymentId: string;
  readonly objectKey: string | null;
  readonly noticeQueuedAt: Date | null;
  readonly document: InvoiceDocument;
}

/**
 * `factura` bajo RLS forzado (plan 009 §3): toma el `EntityManager` de `requireActorScope(actor)`, así que la fila entra
 * en la transacción del cobro (`withActor`).
 */
export interface IInvoiceRepository {
  /** Inserta la factura con el siguiente número `NB-` de la secuencia; el trigger exige que sea del dueño del pago. */
  record(actor: Actor, draft: InvoiceDraft): Promise<Invoice>;
  /** T-07: la factura del actor con su número, plan, referencia y montos; `null` si no existe o es ajena (RLS). */
  findForIssue(actor: Actor, invoiceId: string): Promise<IssuableInvoice | null>;
  /** T-07: guarda la clave del PDF solo si aún no tenía (idempotente). */
  markStored(actor: Actor, invoiceId: string, objectKey: string): Promise<void>;
  /** T-08: marca que el aviso se entregó a `INotifier`, solo si aún no estaba (idempotente). */
  markNoticeQueued(actor: Actor, invoiceId: string): Promise<void>;
  /** 010 RN-4: el NIT de la última factura del actor, o `CF` si no tiene (la factura de la renovación automática). */
  findLatestNit(actor: Actor): Promise<string>;
}

export const I_INVOICE_REPOSITORY = Symbol('IInvoiceRepository');
