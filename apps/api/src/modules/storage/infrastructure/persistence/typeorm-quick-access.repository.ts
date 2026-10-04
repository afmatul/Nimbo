import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { accessibleNodes } from '../../../access';
import type {
  IQuickAccessRepository,
  QuickAccessNode,
  QuickAccessNodeRef,
  QuickAccessRows,
  QuickAccessTake,
} from '../../application/ports/i-quick-access.repository.port';
import type { FileKind } from '../../domain/file-kind';
import type { QuickAccessItem } from '../../domain/quick-access';

import { nodesIn } from './node-sql';
import type { Condition, NodeTable } from './node-sql';

/** Tabla, FK y unicidad de `acceso_rapido` de cada tipo de nodo (dos FK con `CHECK`, ADR-0011). */
interface NodeColumns {
  readonly table: NodeTable;
  readonly foreignKey: 'archivo_id' | 'carpeta_id';
  readonly constraint: 'uq_acceso_archivo' | 'uq_acceso_carpeta';
  /** Expresión de la clase de archivo sobre el alias `n` (`NULL` en carpetas). */
  readonly kind: string;
}

const COLUMNS: Readonly<Record<QuickAccessNodeRef['type'], NodeColumns>> = {
  file: {
    table: 'archivo',
    foreignKey: 'archivo_id',
    constraint: 'uq_acceso_archivo',
    kind: 'n.tipo',
  },
  folder: {
    table: 'carpeta',
    foreignKey: 'carpeta_id',
    constraint: 'uq_acceso_carpeta',
    kind: 'NULL',
  },
};

/** Marca que distingue los dos grupos del listado: fijados o recientes (los recientes excluyen los fijados). */
type MarkGroup = 'pinned' | 'recent';

const GROUP_SQL: Readonly<Record<MarkGroup, { filter: string; order: string }>> = {
  pinned: { filter: 'q.fijado_en IS NOT NULL', order: 'q.fijado_en' },
  recent: { filter: 'q.fijado_en IS NULL', order: 'q.abierto_en' },
};

/** Fila del listado con el nombre y la clase del nodo que señala. */
interface ItemRow {
  readonly tipo: QuickAccessNodeRef['type'];
  readonly nodo_id: string;
  readonly nombre: string;
  readonly clase: FileKind | null;
}

const toItem = (row: ItemRow): QuickAccessItem => ({
  type: row.tipo,
  id: row.nodo_id,
  name: row.nombre,
  ...(row.clase === null ? {} : { kind: row.clase }),
});

/**
 * Filas de `acceso_rapido` del actor cuyos nodos el actor ve vivos: `accessibleNodes(actor)` por `tipo_nodo` y la FK
 * que corresponda, dentro de la consulta (ADR-0005; forma probada con `EXPLAIN` en `quick-access-migrations`).
 */
const visibleRows = (actor: Actor): Condition => {
  const files = nodesIn(accessibleNodes(actor), 'q.archivo_id', 'archivo');
  const folders = nodesIn(accessibleNodes(actor), 'q.carpeta_id', 'carpeta');
  return {
    sql: `q.usuario_id = :actorId AND (${files.sql} OR ${folders.sql})`,
    parameters: { ...files.parameters, ...folders.parameters, actorId: actor.id },
  };
};

/** El nodo `ref` vivo y visible para el actor, con el alias `n` (fuente de toda escritura). */
const accessibleNode = (actor: Actor, ref: QuickAccessNodeRef): Condition => {
  const access = nodesIn(accessibleNodes(actor), 'n.id', COLUMNS[ref.type].table);
  return {
    sql: `n.id = :nodeId AND ${access.sql}`,
    parameters: { ...access.parameters, nodeId: ref.id },
  };
};

/**
 * `IQuickAccessRepository` sobre Postgres (plan 006 §9.2). Toda lectura une `accessibleNodes(actor)` y toda escritura
 * sobre un nodo parte de un `SELECT` del nodo visible (o filtra la FK con el mismo fragmento): lo ajeno o en la papelera
 * no se lee ni se escribe. La RLS `acceso_rapido_cliente` es la segunda barrera. `@Inject` explícito: con `tsx`
 * (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmQuickAccessRepository implements IQuickAccessRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async list(actor: Actor, take: QuickAccessTake): Promise<QuickAccessRows> {
    return {
      pinned: await this.listGroup(actor, 'pinned', take.pinned),
      recent: await this.listGroup(actor, 'recent', take.recent),
    };
  }

  async countPinned(actor: Actor): Promise<number> {
    const visible = visibleRows(actor);
    const rows = await this.query<{ total: number }>(
      actor,
      `SELECT count(*)::int AS total FROM acceso_rapido q
        WHERE ${visible.sql} AND ${GROUP_SQL.pinned.filter}`,
      visible.parameters,
    );
    return rows[0]?.total ?? 0;
  }

  async findAccessibleNode(actor: Actor, ref: QuickAccessNodeRef): Promise<QuickAccessNode | null> {
    const columns = COLUMNS[ref.type];
    const node = accessibleNode(actor, ref);
    const rows = await this.query<ItemRow & { fijado: boolean }>(
      actor,
      `SELECT :nodeType::text AS tipo, n.id AS nodo_id, n.nombre, ${columns.kind} AS clase,
              (q.fijado_en IS NOT NULL) AS fijado
         FROM ${columns.table} n
         LEFT JOIN acceso_rapido q ON q.${columns.foreignKey} = n.id AND q.usuario_id = :actorId
        WHERE ${node.sql}`,
      { ...node.parameters, actorId: actor.id, nodeType: ref.type },
    );
    const [row] = rows;
    return row === undefined ? null : { item: toItem(row), pinned: row.fijado };
  }

  async upsertPin(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void> {
    await this.upsert(actor, ref, {
      marks: ':at::timestamptz, NULL::timestamptz',
      onConflict: 'fijado_en = COALESCE(acceso_rapido.fijado_en, EXCLUDED.fijado_en)',
      at,
    });
  }

  /** Dos sentencias: con apertura queda como reciente; sin ella la fila se borra (`ck_acceso_util`). */
  async removePin(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void> {
    const own = this.ownRowOf(actor, ref);
    await this.query(
      actor,
      `UPDATE acceso_rapido q SET fijado_en = NULL, actualizado_en = :at
        WHERE ${own.sql} AND q.abierto_en IS NOT NULL`,
      { ...own.parameters, at },
    );
    await this.query(
      actor,
      `DELETE FROM acceso_rapido q WHERE ${own.sql} AND q.abierto_en IS NULL`,
      own.parameters,
    );
  }

  async touchRecent(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void> {
    await this.upsert(actor, ref, {
      marks: 'NULL::timestamptz, :at::timestamptz',
      onConflict: 'abierto_en = EXCLUDED.abierto_en',
      at,
    });
  }

  /**
   * Por `usuario_id`, sin unir `accessibleNodes`: las filas son de la cuenta y el colchón también cuenta los nodos en
   * la papelera (si no, sus filas nunca se podarían). `idx_acceso_recientes` sirve a la subconsulta.
   */
  async pruneRecents(actor: Actor, keep: number): Promise<void> {
    await this.query(
      actor,
      `DELETE FROM acceso_rapido
        WHERE usuario_id = :actorId AND fijado_en IS NULL
          AND id NOT IN (SELECT r.id FROM acceso_rapido r
                          WHERE r.usuario_id = :actorId AND r.fijado_en IS NULL
                          ORDER BY r.abierto_en DESC, r.id DESC LIMIT :keep)`,
      { actorId: actor.id, keep },
    );
  }

  private async listGroup(
    actor: Actor,
    group: MarkGroup,
    take: number,
  ): Promise<QuickAccessItem[]> {
    const visible = visibleRows(actor);
    const { filter, order } = GROUP_SQL[group];
    const rows = await this.query<ItemRow>(
      actor,
      `SELECT CASE WHEN q.archivo_id IS NULL THEN 'folder' ELSE 'file' END AS tipo,
              COALESCE(q.archivo_id, q.carpeta_id) AS nodo_id, COALESCE(a.nombre, c.nombre) AS nombre,
              a.tipo AS clase
         FROM acceso_rapido q
         LEFT JOIN archivo a ON a.id = q.archivo_id
         LEFT JOIN carpeta c ON c.id = q.carpeta_id
        WHERE ${visible.sql} AND ${filter}
        ORDER BY ${order} DESC, q.id DESC
        LIMIT :take`,
      { ...visible.parameters, take },
    );
    return rows.map(toItem);
  }

  /**
   * `INSERT … SELECT` desde el nodo visible (nada se escribe si es ajeno o está en la papelera) con
   * `ON CONFLICT ON CONSTRAINT uq_acceso_*`: crea la fila o actualiza la marca.
   */
  private async upsert(
    actor: Actor,
    ref: QuickAccessNodeRef,
    write: { readonly marks: string; readonly onConflict: string; readonly at: Date },
  ): Promise<void> {
    const columns = COLUMNS[ref.type];
    const node = accessibleNode(actor, ref);
    await this.query(
      actor,
      `INSERT INTO acceso_rapido (id, usuario_id, ${columns.foreignKey}, fijado_en, abierto_en, creado_en,
                                  actualizado_en)
       SELECT :rowId::uuid, :actorId::uuid, n.id, ${write.marks}, :at::timestamptz, :at::timestamptz
         FROM ${columns.table} n WHERE ${node.sql}
       ON CONFLICT ON CONSTRAINT ${columns.constraint}
       DO UPDATE SET ${write.onConflict}, actualizado_en = EXCLUDED.actualizado_en`,
      { ...node.parameters, rowId: randomUUID(), actorId: actor.id, at: write.at },
    );
  }

  /** La fila del actor sobre `ref`, solo si el nodo sigue visible (mismo fragmento que las lecturas). */
  private ownRowOf(actor: Actor, ref: QuickAccessNodeRef): Condition {
    const { table, foreignKey } = COLUMNS[ref.type];
    const access = nodesIn(accessibleNodes(actor), `q.${foreignKey}`, table);
    return {
      sql: `q.usuario_id = :actorId AND q.${foreignKey} = :nodeId AND ${access.sql}`,
      parameters: { ...access.parameters, actorId: actor.id, nodeId: ref.id },
    };
  }

  /** SQL con parámetros con nombre (los de los fragmentos de `access`) sobre el `EntityManager` del actor. */
  private async query<T>(
    actor: Actor,
    sql: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<T[]> {
    const manager: EntityManager = this.context.requireActorScope(actor);
    const [query, values] = manager.connection.driver.escapeQueryWithParameters(
      sql,
      { ...parameters },
      {},
    );
    return (await manager.query(query, values)) as T[];
  }
}
