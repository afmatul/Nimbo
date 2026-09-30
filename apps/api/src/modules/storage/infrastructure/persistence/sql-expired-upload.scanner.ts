import { Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type {
  ExpiredUpload,
  IExpiredUploadScanner,
} from '../../application/ports/i-expired-upload.scanner.port';

const EXPIRED_UPLOADS_SQL = 'SELECT id, propietario_id FROM carga_expiradas($1, $2)';

interface ExpiredUploadRow {
  readonly id: string;
  readonly propietario_id: string;
}

/**
 * `IExpiredUploadScanner` sobre la función `SECURITY DEFINER` `carga_expiradas` (ADR-0021). Usa el `EntityManager`
 * vigente (el de `ITransactionRunner.run`): la función no toca datos bajo RLS y `nimbo_app` sigue sin ver `carga`.
 */
@Injectable()
export class SqlExpiredUploadScanner implements IExpiredUploadScanner {
  constructor(private readonly context: TransactionContext) {}

  async listExpiredIds(now: Date, limit: number): Promise<readonly ExpiredUpload[]> {
    const rows = (await this.context
      .manager()
      .query(EXPIRED_UPLOADS_SQL, [now, limit])) as ExpiredUploadRow[];
    return rows.map((row) => ({ id: row.id, propietarioId: row.propietario_id }));
  }
}
