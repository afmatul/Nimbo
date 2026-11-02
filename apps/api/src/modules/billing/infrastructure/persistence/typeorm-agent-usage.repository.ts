import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  IAgentUsageRepository,
  ReserveInput,
} from '../../application/ports/i-agent-usage.repository.port';

/**
 * CA-12: una sola sentencia. Las reservas simultáneas de la misma fila se esperan en el conflicto de la clave primaria y
 * Postgres vuelve a evaluar el `WHERE` con el valor confirmado; sin fila devuelta, la cuota está agotada. `$3 > 0`
 * evita que un plan con límite 0 cree la fila con 1.
 */
const RESERVE_SQL = `INSERT INTO uso_agente (usuario_id, periodo_inicio, consultas)
  SELECT $1, $2, 1 WHERE $3::int > 0
  ON CONFLICT (usuario_id, periodo_inicio) DO UPDATE
    SET consultas = uso_agente.consultas + 1, actualizado_en = now()
    WHERE uso_agente.consultas < $3::int
  RETURNING consultas`;

const RELEASE_SQL = `UPDATE uso_agente SET consultas = consultas - 1, actualizado_en = now()
  WHERE usuario_id = $1 AND periodo_inicio = $2 AND consultas > 0`;

const READ_SQL = 'SELECT consultas FROM uso_agente WHERE usuario_id = $1 AND periodo_inicio = $2';

/**
 * `IAgentUsageRepository` sobre `uso_agente` (plan 020 §3) con el `EntityManager` de `TransactionContext`, como
 * `TypeOrmSubscriptionRepository`: fuera de `withActor` la RLS forzada no vería al actor.
 */
@Injectable()
export class TypeOrmAgentUsageRepository implements IAgentUsageRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async reserveOne(actor: Actor, input: ReserveInput): Promise<number | null> {
    const params = [actor.id, input.periodStartsAt, input.limit];
    const rows = (await this.context.requireActorScope(actor).query(RESERVE_SQL, params)) as {
      consultas: number;
    }[];
    return rows[0]?.consultas ?? null;
  }

  async releaseOne(actor: Actor, periodStartsAt: Date): Promise<void> {
    await this.context.requireActorScope(actor).query(RELEASE_SQL, [actor.id, periodStartsAt]);
  }

  async read(actor: Actor, periodStartsAt: Date): Promise<number> {
    const rows = (await this.context
      .requireActorScope(actor)
      .query(READ_SQL, [actor.id, periodStartsAt])) as { consultas: number }[];
    return rows[0]?.consultas ?? 0;
  }
}
