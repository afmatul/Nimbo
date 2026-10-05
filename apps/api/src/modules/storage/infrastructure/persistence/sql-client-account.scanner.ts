import { Inject, Injectable } from '@nestjs/common';

import { Role, TransactionContext } from '../../../../shared';
import type { IClientAccountScanner } from '../../application/ports/i-client-account.scanner.port';

/**
 * Extiende la excepción DF-59 (DF-62, plan D-12): además de `espacio_usado`, `storage` lee `usuario.id` y `rol`, solo
 * aquí y solo para listar ids. `usuario` no tiene RLS, así que no hace falta función `SECURITY DEFINER`.
 */
const CLIENT_IDS_SQL = `SELECT id FROM usuario
  WHERE rol = $1 AND ($2::uuid IS NULL OR id > $2::uuid)
  ORDER BY id LIMIT $3`;

/**
 * `IClientAccountScanner` sobre Postgres. Usa el `EntityManager` vigente (el de `ITransactionRunner.run`, sin actor) y
 * devuelve solo UUID: medir y corregir lo hace `UsageReconciler` como cada dueño, bajo RLS normal.
 */
@Injectable()
export class SqlClientAccountScanner implements IClientAccountScanner {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async listClientIds(afterId: string | null, limit: number): Promise<readonly string[]> {
    const rows = (await this.context
      .manager()
      .query(CLIENT_IDS_SQL, [Role.CLIENT, afterId, limit])) as { id: string }[];
    return rows.map((row) => row.id);
  }
}
