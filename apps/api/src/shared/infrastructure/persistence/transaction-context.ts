import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

const storage = new AsyncLocalStorage<EntityManager>();

/**
 * `EntityManager` vigente para los repositorios (001 plan §6.7): el de la transacción abierta por
 * `ITransactionRunner.run` o, fuera de ella, el del `DataSource`. Vive en `AsyncLocalStorage`, así sobrevive a los
 * `await` y dos transacciones concurrentes no se mezclan. 003 construye `withActor` sobre la misma ALS.
 */
@Injectable()
export class TransactionContext {
  constructor(private readonly dataSource: DataSource) {}

  manager(): EntityManager {
    return storage.getStore() ?? this.dataSource.manager;
  }

  /** Ejecuta `work` con `manager` como el vigente. Solo lo llaman los ejecutores de transacciones. */
  runWith<T>(manager: EntityManager, work: () => Promise<T>): Promise<T> {
    return storage.run(manager, work);
  }
}
