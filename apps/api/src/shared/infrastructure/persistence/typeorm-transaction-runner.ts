import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { ITransactionRunner } from '../../application/persistence/i-transaction-runner.port';
import type { Actor } from '../../domain/actor';
import { Role } from '../../domain/role.enum';

import { ActorScopeConflictError, InvalidActorError } from './actor-scope.errors';
import { isSameActor, TransactionContext } from './transaction-context';

/**
 * Fija el actor local a la transacción (`true`), con nombre y valor como parámetros enlazados (ADR-0005). Es el
 * único lugar del código que fija `app.*`: el lint `rls.js` lo prohíbe en el resto (PD-26).
 */
const SET_ACTOR_SQL = 'SELECT set_config($1, $2, true), set_config($3, $4, true)';
const ACTOR_ID_SETTING = 'app.actor_id';
const ACTOR_ROLE_SETTING = 'app.actor_role';

/** UUID en su forma canónica: lo que `nimbo_actor_id()` convierte con `::uuid` sin fallar dentro de una política. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: readonly string[] = Object.values(Role);

const assertValidActor = (actor: Actor): void => {
  if (!UUID_PATTERN.test(actor.id) || !ROLES.includes(actor.role)) {
    throw new InvalidActorError();
  }
};

/** `ITransactionRunner` con `DataSource.transaction`: publica la transacción (y su actor) en `TransactionContext`. */
@Injectable()
export class TypeOrmTransactionRunner implements ITransactionRunner {
  constructor(
    private readonly dataSource: DataSource,
    private readonly context: TransactionContext,
  ) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.current() !== undefined) {
      return work();
    }
    return this.dataSource.transaction((manager) => this.context.runWith({ manager }, work));
  }

  async withActor<T>(actor: Actor, work: () => Promise<T>): Promise<T> {
    assertValidActor(actor);
    const scope = this.context.current();
    if (scope !== undefined) {
      if (scope.actor === undefined || !isSameActor(scope.actor, actor)) {
        throw new ActorScopeConflictError();
      }
      return work();
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SET_ACTOR_SQL, [
        ACTOR_ID_SETTING,
        actor.id,
        ACTOR_ROLE_SETTING,
        actor.role,
      ]);
      return this.context.runWith({ manager, actor }, work);
    });
  }
}
