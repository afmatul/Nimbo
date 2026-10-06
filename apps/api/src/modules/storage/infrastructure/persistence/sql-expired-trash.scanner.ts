import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type {
  ExpiredTrashItem,
  IExpiredTrashScanner,
} from '../../application/ports/i-expired-trash.scanner.port';

const EXPIRED_TRASH_SQL = 'SELECT tipo_nodo, id, propietario_id FROM papelera_vencida($1, $2)';

interface ExpiredTrashRow {
  readonly tipo_nodo: 'archivo' | 'carpeta';
  readonly id: string;
  readonly propietario_id: string;
}

/**
 * `IExpiredTrashScanner` sobre la función `SECURITY DEFINER` `papelera_vencida` (plan 006 §3, ADR-0021). Usa el
 * `EntityManager` vigente (el de `ITransactionRunner.run`): `nimbo_app` sin actor sigue sin ver `archivo` ni `carpeta`.
 */
@Injectable()
export class SqlExpiredTrashScanner implements IExpiredTrashScanner {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async listExpired(now: Date, limit: number): Promise<readonly ExpiredTrashItem[]> {
    const rows = (await this.context
      .manager()
      .query(EXPIRED_TRASH_SQL, [now, limit])) as ExpiredTrashRow[];
    return rows.map((row) => ({
      type: row.tipo_nodo === 'archivo' ? 'file' : 'folder',
      id: row.id,
      propietarioId: row.propietario_id,
    }));
  }
}
