import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type {
  IPendingInvoiceScanner,
  PendingInvoice,
} from '../../application/ports/i-pending-invoice.scanner.port';

const PENDING_SQL = 'SELECT factura_id, usuario_id FROM facturas_pendientes_de_emitir($1)';

/**
 * `IPendingInvoiceScanner` sobre Postgres (spec 009 T-07; ADR-0021). Usa el `EntityManager` de `ITransactionRunner.run`
 * (sin actor: la función falla con uno) y devuelve solo UUID; emitir lo hace `InvoiceIssuer` como cada dueño.
 */
@Injectable()
export class SqlPendingInvoiceScanner implements IPendingInvoiceScanner {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async listPending(limit: number): Promise<readonly PendingInvoice[]> {
    const rows = (await this.context.manager().query(PENDING_SQL, [limit])) as {
      factura_id: string;
      usuario_id: string;
    }[];
    return rows.map((row) => ({ invoiceId: row.factura_id, userId: row.usuario_id }));
  }
}
