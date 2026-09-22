import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { HealthCheckName, HealthCheckStatus } from '@nimbo/contracts';
import { DataSource } from 'typeorm';

import { READY_TIMEOUT_MS } from '../../application/health/health.service';
import type { IHealthIndicator } from '../../application/health/i-health-indicator.port';

/**
 * `SELECT 1` sobre la conexión de TypeORM que `SharedModule` ya mantiene, con el mismo límite
 * que `HealthService` aplica a cada indicador: sin él, `ready` responde `down` a los
 * `READY_TIMEOUT_MS` pero la consulta seguiría ocupando una conexión del pool.
 *
 * El `SET LOCAL` vive dentro de una transacción que siempre se revierte, así la conexión regresa
 * al pool sin el ajuste pegado.
 */
@Injectable()
export class PostgresHealthIndicator implements IHealthIndicator {
  readonly name: HealthCheckName = 'postgres';

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<HealthCheckStatus> {
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      await runner.query(`SET LOCAL statement_timeout = ${READY_TIMEOUT_MS}`);
      await runner.query('SELECT 1');
      return 'up';
    } finally {
      await runner.rollbackTransaction().catch(() => undefined);
      await runner.release();
    }
  }
}
