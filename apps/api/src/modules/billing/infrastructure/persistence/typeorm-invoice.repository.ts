import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  IInvoiceRepository,
  IssuableInvoice,
} from '../../application/ports/i-invoice-repository.port';
import type { Invoice, InvoiceDraft } from '../../domain/entities/invoice.entity';
import { formatInvoiceNumber } from '../../domain/sequence-number';

const NEXT_NUMBER_SQL = `SELECT nextval('factura_numero_seq')::int AS sequence`;
const INSERT_SQL = `INSERT INTO factura (transaccion_id, usuario_id, numero, subtotal_centavos, iva_centavos,
    total_centavos, nit, correo_comprobante, creado_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;

/** La factura con la referencia del pago y el nombre del plan, para imprimirla (T-07). */
const FOR_ISSUE_SQL = `SELECT f.id, f.transaccion_id, f.aviso_encolado_en, f.numero, f.creado_en, f.subtotal_centavos, f.iva_centavos, f.total_centavos,
    f.nit, f.correo_comprobante, f.clave_objeto, t.referencia, p.nombre AS plan
  FROM factura f JOIN transaccion t ON t.id = f.transaccion_id JOIN plan p ON p.id = t.plan_id
  WHERE f.id = $1`;
const MARK_STORED_SQL =
  'UPDATE factura SET clave_objeto = $2 WHERE id = $1 AND clave_objeto IS NULL';
const MARK_NOTICE_SQL =
  'UPDATE factura SET aviso_encolado_en = now() WHERE id = $1 AND aviso_encolado_en IS NULL';

interface IssuableRow {
  readonly id: string;
  readonly transaccion_id: string;
  readonly aviso_encolado_en: Date | null;
  readonly numero: string;
  readonly creado_en: Date;
  readonly subtotal_centavos: number;
  readonly iva_centavos: number;
  readonly total_centavos: number;
  readonly nit: string;
  readonly correo_comprobante: string;
  readonly clave_objeto: string | null;
  readonly referencia: string;
  readonly plan: string;
}

const toIssuable = (row: IssuableRow): IssuableInvoice => ({
  id: row.id,
  paymentId: row.transaccion_id,
  objectKey: row.clave_objeto,
  noticeQueuedAt: row.aviso_encolado_en,
  document: {
    number: row.numero,
    issuedAt: row.creado_en,
    planName: row.plan,
    paymentReference: row.referencia,
    subtotalCents: row.subtotal_centavos,
    vatCents: row.iva_centavos,
    totalCents: row.total_centavos,
    nit: row.nit,
    receiptEmail: row.correo_comprobante,
  },
});

/** `nextval` e `INSERT … RETURNING` siempre devuelven una fila; si no, falla el cobro entero. */
const onlyRow = <T>(rows: readonly T[]): T => {
  const [row] = rows;
  if (row === undefined) throw new Error('La base no devolvió la fila de la factura.');
  return row;
};

/**
 * `IInvoiceRepository` sobre `factura` (plan 009 §3) con el `EntityManager` de `TransactionContext`: la fila entra en
 * la transacción del cobro. `usuario_id` es el del actor, dueño del pago; el trigger de la tabla lo comprueba.
 */
@Injectable()
export class TypeOrmInvoiceRepository implements IInvoiceRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async record(actor: Actor, draft: InvoiceDraft): Promise<Invoice> {
    const manager = this.context.requireActorScope(actor);
    const next = onlyRow((await manager.query(NEXT_NUMBER_SQL)) as { sequence: number }[]);
    const number = formatInvoiceNumber(draft.createdAt.getUTCFullYear(), next.sequence);
    const row = onlyRow(
      (await manager.query(INSERT_SQL, [
        draft.paymentId,
        actor.id,
        number,
        draft.subtotal.cents,
        draft.vat.cents,
        draft.total.cents,
        draft.nit,
        draft.receiptEmail,
        draft.createdAt,
      ])) as { id: string }[],
    );
    return { ...draft, id: row.id, userId: actor.id, number };
  }

  async findForIssue(actor: Actor, invoiceId: string): Promise<IssuableInvoice | null> {
    const manager = this.context.requireActorScope(actor);
    const [row] = (await manager.query(FOR_ISSUE_SQL, [invoiceId])) as IssuableRow[];
    return row === undefined ? null : toIssuable(row);
  }

  async markStored(actor: Actor, invoiceId: string, objectKey: string): Promise<void> {
    await this.context.requireActorScope(actor).query(MARK_STORED_SQL, [invoiceId, objectKey]);
  }

  async markNoticeQueued(actor: Actor, invoiceId: string): Promise<void> {
    await this.context.requireActorScope(actor).query(MARK_NOTICE_SQL, [invoiceId]);
  }
}
