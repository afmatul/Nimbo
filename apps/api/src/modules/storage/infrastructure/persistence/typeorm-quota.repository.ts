import { Inject, Injectable } from '@nestjs/common';

import { BIGINT_TRANSFORMER, TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IQuotaRepository } from '../../application/ports/i-quota.repository.port';
import type { QuotaUsage } from '../../domain/quota-policy';

/** Excepción D-5 / DF-59: las únicas sentencias de `storage` sobre `usuario`, y solo sobre `espacio_usado`. */
const READ_USAGE_SQL = 'SELECT espacio_usado::text AS usado FROM usuario WHERE id = $1';
const LOCK_USAGE_SQL = `${READ_USAGE_SQL} FOR UPDATE`;
const ADD_USED_BYTES_SQL =
  'UPDATE usuario SET espacio_usado = espacio_usado + $1::bigint WHERE id = $2';
/** La reserva es la fila `carga` activa y no vencida (D-5): no hay contador que se desincronice. */
const RESERVED_BYTES_SQL = `SELECT COALESCE(sum(tamano_bytes), 0)::text AS reservado FROM carga
   WHERE propietario_id = $1 AND estado = 'activa' AND expira_en > $2`;

const toBytes = (value: string | undefined): bigint => {
  const bytes = BIGINT_TRANSFORMER.from(value ?? null);
  if (bytes === null) {
    throw new Error('La cuenta del actor no existe: no se puede leer su espacio usado.');
  }
  return bytes;
};

/**
 * `IQuotaRepository` sobre Postgres (plan §6 «Puertos», D-5). `usuario` no tiene RLS: cada sentencia filtra por
 * `actor.id`, y el `EntityManager` sale de `requireActorScope(actor)`. `@Inject` explícito: con `tsx` no hay
 * `design:paramtypes`.
 */
@Injectable()
export class TypeOrmQuotaRepository implements IQuotaRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async lockUsage(actor: Actor): Promise<bigint> {
    const rows = (await this.context
      .requireActorScope(actor)
      .query(LOCK_USAGE_SQL, [actor.id])) as { usado: string }[];
    return toBytes(rows[0]?.usado);
  }

  async readUsage(actor: Actor, now: Date): Promise<QuotaUsage> {
    const manager = this.context.requireActorScope(actor);
    const used = (await manager.query(READ_USAGE_SQL, [actor.id])) as { usado: string }[];
    const reserved = (await manager.query(RESERVED_BYTES_SQL, [actor.id, now])) as {
      reservado: string;
    }[];
    return { usedBytes: toBytes(used[0]?.usado), reservedBytes: toBytes(reserved[0]?.reservado) };
  }

  /** Con la fila ya bloqueada, la lectura sin bloqueo ve el valor que retiene la transacción. */
  async lockAndReadUsage(actor: Actor, now: Date): Promise<QuotaUsage> {
    await this.lockUsage(actor);
    return this.readUsage(actor, now);
  }

  async addUsedBytes(actor: Actor, deltaBytes: bigint): Promise<void> {
    await this.context
      .requireActorScope(actor)
      .query(ADD_USED_BYTES_SQL, [deltaBytes.toString(), actor.id]);
  }
}
