import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { HealthCheckName, HealthCheckStatus } from '@nimbo/contracts';
import { DataSource } from 'typeorm';

import type { IHealthIndicator } from '../../application/health/i-health-indicator.port';

/** `SELECT 1` sobre la conexión de TypeORM que `SharedModule` ya mantiene. */
@Injectable()
export class PostgresHealthIndicator implements IHealthIndicator {
  readonly name: HealthCheckName = 'postgres';

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<HealthCheckStatus> {
    await this.dataSource.query('SELECT 1');
    return 'up';
  }
}
