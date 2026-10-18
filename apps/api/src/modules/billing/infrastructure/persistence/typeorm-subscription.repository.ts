import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  ISubscriptionRepository,
  SubscriptionStanding,
} from '../../application/ports/i-subscription-repository.port';
import { Subscription } from '../../domain/entities/subscription.entity';
import type { SubscriptionStatus } from '../../domain/entities/subscription.entity';
import { PERSONAL_PLAN_SLUG } from '../../domain/plan-slug';

const INSERT_PERSONAL_SQL = `INSERT INTO suscripcion (usuario_id, plan_id)
  SELECT $1, p.id FROM plan p WHERE p.slug = $2
  ON CONFLICT ON CONSTRAINT uq_suscripcion_usuario DO NOTHING`;

const CURRENT_SQL = `SELECT plan_id, iniciado_en, vence_en, estado, renovacion_automatica, plan_pendiente_id
  FROM suscripcion WHERE usuario_id = $1`;

/**
 * La fila del actor, bloqueada para el cobro. Sin `JOIN`: si otro cobro la cambia mientras se espera el candado,
 * Postgres vuelve a evaluar la fila nueva contra la fila de `plan` vieja, el `JOIN` deja de coincidir y la fila
 * desaparece del resultado. El `slug` se lee después, ya con el candado.
 */
const LOCK_CURRENT_SQL = `${CURRENT_SQL} FOR UPDATE`;

const PLAN_SLUG_SQL = 'SELECT slug FROM plan WHERE id = $1';

const STANDING_SQL = 'SELECT plan_id, estado FROM suscripcion WHERE usuario_id = $1';

const SAVE_SQL = `UPDATE suscripcion SET plan_id = $2, iniciado_en = $3, vence_en = $4, estado = $5,
    renovacion_automatica = $6, plan_pendiente_id = $7, actualizado_en = now()
  WHERE usuario_id = $1`;

interface StandingRow {
  readonly plan_id: string;
  readonly estado: SubscriptionStatus;
}

interface CurrentRow extends StandingRow {
  readonly iniciado_en: Date;
  readonly vence_en: Date | null;
  readonly renovacion_automatica: boolean;
  readonly plan_pendiente_id: string | null;
}

/**
 * `ISubscriptionRepository` sobre `suscripcion` (plan 009 §3) con el `EntityManager` de `TransactionContext`: con
 * `@InjectRepository` la escritura escaparía de `withActor` y la RLS forzada no vería al actor.
 */
@Injectable()
export class TypeOrmSubscriptionRepository implements ISubscriptionRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async findStanding(actor: Actor): Promise<SubscriptionStanding | null> {
    const [row] = (await this.context
      .requireActorScope(actor)
      .query(STANDING_SQL, [actor.id])) as StandingRow[];
    return row === undefined
      ? null
      : { planId: row.plan_id, readOnly: row.estado === 'solo_lectura' };
  }

  async insertPersonalIfAbsent(actor: Actor): Promise<void> {
    await this.context
      .requireActorScope(actor)
      .query(INSERT_PERSONAL_SQL, [actor.id, PERSONAL_PLAN_SLUG]);
  }

  async findCurrent(actor: Actor): Promise<Subscription | null> {
    const row = await this.currentRow(actor, CURRENT_SQL);
    return row === undefined ? null : this.toSubscription(actor, row);
  }

  async lockCurrent(actor: Actor): Promise<Subscription> {
    const row = await this.currentRow(actor, LOCK_CURRENT_SQL);
    if (row === undefined) {
      throw new Error('El cliente no tiene suscripción: el cobro la garantiza antes de bloquear.');
    }
    return this.toSubscription(actor, row);
  }

  private async currentRow(actor: Actor, sql: string): Promise<CurrentRow | undefined> {
    const rows = (await this.context
      .requireActorScope(actor)
      .query(sql, [actor.id])) as CurrentRow[];
    return rows[0];
  }

  private async toSubscription(actor: Actor, row: CurrentRow): Promise<Subscription> {
    const [plan] = (await this.context
      .requireActorScope(actor)
      .query(PLAN_SLUG_SQL, [row.plan_id])) as { slug: string }[];
    if (plan === undefined) throw new Error('La suscripción apunta a un plan que no existe.');
    return Subscription.rehydrate({
      userId: actor.id,
      planId: row.plan_id,
      planSlug: plan.slug,
      startedAt: row.iniciado_en,
      expiresAt: row.vence_en,
      status: row.estado,
      autoRenew: row.renovacion_automatica,
      pendingPlanId: row.plan_pendiente_id,
    });
  }

  async save(actor: Actor, subscription: Subscription): Promise<void> {
    await this.context
      .requireActorScope(actor)
      .query(SAVE_SQL, [
        actor.id,
        subscription.planId,
        subscription.startedAt,
        subscription.expiresAt,
        subscription.status,
        subscription.autoRenew,
        subscription.pendingPlanId,
      ]);
  }
}
