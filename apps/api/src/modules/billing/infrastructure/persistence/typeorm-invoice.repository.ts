import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IInvoiceRepository } from '../../application/ports/i-invoice-repository.port';
import type { Invoice, InvoiceDraft } from '../../domain/entities/invoice.entity';
import { formatInvoiceNumber } from '../../domain/sequence-number';

const NEXT_NUMBER_SQL = `SELECT nextval('factura_numero_seq')::int AS sequence`;
const INSERT_SQL = `INSERT INTO factura (transaccion_id, usuario_id, numero, subtotal_centavos, iva_centavos,
    total_centavos, nit, correo_comprobante, creado_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;

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
}
