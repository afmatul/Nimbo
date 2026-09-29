import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import type { Actor } from '../../domain/actor';

import { ActorScopeConflictError, ActorScopeMissingError } from './actor-scope.errors';

/** Transacción vigente: su `EntityManager` y, si la abrió `withActor`, el actor fijado en ella (003 plan §6.3). */
export interface TransactionScope {
  readonly manager: EntityManager;
  readonly actor?: Actor;
}

const storage = new AsyncLocalStorage<TransactionScope>();

/** Mismo actor = mismo `id` y mismo rol: lo que `withActor` fija en `app.actor_id` y `app.actor_role`. */
export const isSameActor = (a: Actor, b: Actor): boolean => a.id === b.id && a.role === b.role;

/**
 * `EntityManager` vigente para los repositorios (001 plan §6.7): el de la transacción abierta por
 * `ITransactionRunner` o, fuera de ella, el del `DataSource`. Vive en `AsyncLocalStorage`, así sobrevive a los
 * `await` y dos transacciones concurrentes no se mezclan. 003 agrega el actor de `withActor` a la misma ALS.
 */
@Injectable()
export class TransactionContext {
  constructor(private readonly dataSource: DataSource) {}

  manager(): EntityManager {
    return storage.getStore()?.manager ?? this.dataSource.manager;
  }

  /** La transacción vigente, o `undefined` fuera de toda transacción. */
  current(): TransactionScope | undefined {
    return storage.getStore();
  }

  /**
   * El `EntityManager` de la transacción de `actor` (ADR-0005). Los repositorios de datos de cliente y
   * `SqlAccessLevelReader` lo obtienen **solo** de aquí: sin `withActor` lanza, nunca cae al manager raíz.
   */
  requireActorScope(actor: Actor): EntityManager {
    const scope = storage.getStore();
    if (scope?.actor === undefined) {
      throw new ActorScopeMissingError();
    }
    if (!isSameActor(scope.actor, actor)) {
      throw new ActorScopeConflictError();
    }
    return scope.manager;
  }

  /** Ejecuta `work` con `scope` como la transacción vigente. Solo lo llaman los ejecutores de transacciones. */
  runWith<T>(scope: TransactionScope, work: () => Promise<T>): Promise<T> {
    return storage.run(scope, work);
  }
}
