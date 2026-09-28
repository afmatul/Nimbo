import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { ITransactionRunner } from '../../application/persistence/i-transaction-runner.port';

import { TransactionContext } from './transaction-context';

/** `ITransactionRunner` con `DataSource.transaction`: publica el `EntityManager` en `TransactionContext`. */
@Injectable()
export class TypeOrmTransactionRunner implements ITransactionRunner {
  constructor(
    private readonly dataSource: DataSource,
    private readonly context: TransactionContext,
  ) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => this.context.runWith(manager, work));
  }
}
