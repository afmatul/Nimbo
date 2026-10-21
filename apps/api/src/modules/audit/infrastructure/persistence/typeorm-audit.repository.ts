import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_PAGE_SIZE } from '@nimbo/contracts';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { AuditPage, IAuditRepository } from '../../application/ports/i-audit.repository.port';
import { isSystemActor } from '../../domain/audit-actor';
import type { AuditActor, AuditActorRole } from '../../domain/audit-actor';
import type { AuditAttributes, AuditEntry, AuditResourceType } from '../../domain/audit-entry';
import { createAuditEntry } from '../../domain/audit-entry';
import type { AuditOrigin, AuditQuery } from '../../domain/audit-query';

import { decodeAuditCursor, encodeAuditCursor } from './audit-cursor';

/** Fila de `evento_auditoria` tal como la devuelve `pg` (`jsonb` ya parseado, `timestamptz` como `Date`). */
interface EventRow {
  readonly id: string;
  readonly accion: string;
  readonly actor_id: string | null;
  readonly rol_actor: AuditActorRole;
  readonly usuario_afectado_id: string | null;
  readonly tipo_recurso: AuditResourceType | null;
  readonly recurso_id: string | null;
  readonly atributos: AuditAttributes;
  readonly ocurrido_en: Date;
  readonly correlation_id: string | null;
}

/** Fragmento de `WHERE` con sus parámetros con nombre. */
interface Condition {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** «Yo» = el actor es el afectado; «Personal de Nimbo» = cualquier otro, incluido el actor anonimizado (D-8). */
const ORIGIN_SQL: Readonly<Record<AuditOrigin, string>> = {
  self: 'actor_id IS NOT DISTINCT FROM usuario_afectado_id',
  staff: 'actor_id IS DISTINCT FROM usuario_afectado_id',
};

const INSERT_SQL = `INSERT INTO evento_auditoria (id, accion, actor_id, rol_actor, usuario_afectado_id, tipo_recurso,
                      recurso_id, atributos, ocurrido_en, correlation_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`;

const SELECT_SQL = `SELECT id, accion, actor_id, rol_actor, usuario_afectado_id, tipo_recurso, recurso_id, atributos,
                           ocurrido_en, correlation_id FROM evento_auditoria`;

const toEntry = (row: EventRow): AuditEntry =>
  createAuditEntry({
    id: row.id,
    action: row.accion,
    actorId: row.actor_id,
    actorRole: row.rol_actor,
    targetUserId: row.usuario_afectado_id,
    resourceType: row.tipo_recurso,
    resourceId: row.recurso_id,
    attributes: row.atributos,
    occurredAt: row.ocurrido_en,
    correlationId: row.correlation_id,
  });

/** El afectado es el actor (filtro dentro del SQL, Art. IX.2; RLS es la segunda barrera) más los filtros opcionales. */
function conditionsFor(actor: Actor, query: AuditQuery): Condition[] {
  const { from, to, origin, cursor } = query;
  const optional: readonly (Condition | undefined)[] = [
    from === undefined ? undefined : { sql: 'ocurrido_en >= :from', parameters: { from } },
    to === undefined ? undefined : { sql: 'ocurrido_en < :to', parameters: { to } },
    origin === undefined ? undefined : { sql: ORIGIN_SQL[origin], parameters: {} },
    cursor === undefined ? undefined : afterCursor(cursor),
  ];
  return [
    { sql: 'usuario_afectado_id = :targetUserId', parameters: { targetUserId: actor.id } },
    ...optional.filter((condition): condition is Condition => condition !== undefined),
  ];
}

/** Teclado `(ocurrido_en, id)`: el `id` desempata los eventos del mismo milisegundo (R-4). */
function afterCursor(cursor: string): Condition {
  const position = decodeAuditCursor(cursor);
  return {
    sql: '(ocurrido_en, id) < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))',
    parameters: { cursorAt: position.occurredAt, cursorId: position.id },
  };
}

/** Recorta la fila de más (`LIMIT` + 1) y arma el cursor desde la última que se devuelve. */
function toPage(rows: readonly EventRow[]): AuditPage {
  const entries = rows.slice(0, AUDIT_PAGE_SIZE).map(toEntry);
  const last = entries.at(-1);
  const hasMore = rows.length > AUDIT_PAGE_SIZE && last !== undefined;
  return {
    entries,
    nextCursor: hasMore ? encodeAuditCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
  };
}

/**
 * `evento_auditoria` sobre `TransactionContext` (plan 004 §2): SQL parametrizado y el `EntityManager` de
 * `requireActorScope(actor)`, así se une a la transacción vigente del mismo actor; el sistema inserta en la
 * transacción vigente sin actor (`run`), donde solo lo admite la política `evento_auditoria_alta_sistema` (011 plan
 * §3). Los instantes vienen de `IClock` con milisegundos; un escritor con microsegundos rompería el ida y vuelta del
 * cursor (R-4).
 */
@Injectable()
export class TypeOrmAuditRepository implements IAuditRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async insert(actor: AuditActor, entry: AuditEntry): Promise<void> {
    const manager = isSystemActor(actor) ? this.context.manager() : this.manager(actor);
    await manager.query(INSERT_SQL, [
      entry.id,
      entry.action,
      entry.actorId,
      entry.actorRole,
      entry.targetUserId,
      entry.resourceType,
      entry.resourceId,
      JSON.stringify(entry.attributes),
      entry.occurredAt,
      entry.correlationId,
    ]);
  }

  async listForTarget(actor: Actor, query: AuditQuery): Promise<AuditPage> {
    const conditions = conditionsFor(actor, query);
    const sql = `${SELECT_SQL} WHERE ${conditions.map((condition) => condition.sql).join(' AND ')}
                 ORDER BY ocurrido_en DESC, id DESC LIMIT :limit`;
    const parameters = Object.assign(
      { limit: AUDIT_PAGE_SIZE + 1 },
      ...conditions.map((c) => c.parameters),
    );
    return toPage(await this.select(actor, sql, parameters));
  }

  private async select(
    actor: Actor,
    sql: string,
    parameters: Record<string, unknown>,
  ): Promise<EventRow[]> {
    const manager = this.manager(actor);
    const [query, values] = manager.connection.driver.escapeQueryWithParameters(
      sql,
      parameters,
      {},
    );
    return (await manager.query(query, values)) as EventRow[];
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
