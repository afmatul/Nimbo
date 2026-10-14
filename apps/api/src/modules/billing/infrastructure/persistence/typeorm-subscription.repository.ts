import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { ISubscriptionRepository } from '../../application/ports/i-subscription-repository.port';
import { PERSONAL_PLAN_SLUG } from '../../domain/plan-slug';

/**
 * `ISubscriptionRepository` sobre `suscripcion` (plan 009 §3) con el `EntityManager` de `TransactionContext`: con
 * `@InjectRepository` la escritura escaparía de `withActor` y la RLS forzada no vería al actor.
 */
@Injectable()
export class TypeOrmSubscriptionRepository implements ISubscriptionRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async insertPersonalIfAbsent(actor: Actor): Promise<void> {
    await this.context.requireActorScope(actor).query(
      `INSERT INTO suscripcion (usuario_id, plan_id)
       SELECT $1, p.id FROM plan p WHERE p.slug = $2
       ON CONFLICT ON CONSTRAINT uq_suscripcion_usuario DO NOTHING`,
      [actor.id, PERSONAL_PLAN_SLUG],
    );
  }
}
