import type { EntityManager } from 'typeorm';

import type {
  TrashEntry,
  TrashItemType,
  TrashPage,
} from '../../application/ports/i-trash.repository.port';
import type { FileKind } from '../../domain/file-kind';

import { selectRows } from './node-sql';
import type { Condition } from './node-sql';
import { decodeTrashCursor, encodeTrashCursor } from './trash-cursor';

/**
 * Fila de raíces de la papelera (`tipo, id, nombre, clase, padre_id, eliminado_en, purgar_en, tamano`) con su carpeta
 * original (si sigue existiendo). La comparten la papelera del cliente (006) y la de Soporte (011b).
 */
export interface TrashEntryRow {
  readonly tipo: TrashItemType;
  readonly id: string;
  readonly nombre: string;
  readonly clase: FileKind | null;
  readonly eliminado_en: Date;
  readonly purgar_en: Date;
  readonly tamano: string;
  readonly padre_id: string | null;
  readonly padre_nombre: string | null;
}

/** Raíces que se leen: su SQL, el parámetro del dueño de la carpeta original, el filtro y cuántas filas. */
export interface TrashEntriesQuery {
  readonly roots: Condition;
  readonly ownerParameter: string;
  readonly filter: Condition;
  readonly take: number;
}

export const toEntry = (row: TrashEntryRow): TrashEntry => ({
  id: row.id,
  type: row.tipo,
  name: row.nombre,
  kind: row.clase,
  sizeBytes: BigInt(row.tamano),
  originalFolder:
    row.padre_id === null || row.padre_nombre === null
      ? null
      : { id: row.padre_id, name: row.padre_nombre },
  deletedAt: row.eliminado_en,
  purgeAt: row.purgar_en,
});

/** Lo que sigue a `cursor` en `eliminado_en DESC, id DESC`; sin cursor, todo. Lanza `InvalidQueryError` si no vale. */
export const afterCursor = (cursor: string | undefined): Condition => {
  if (cursor === undefined) return { sql: 'true', parameters: {} };
  const after = decodeTrashCursor(cursor);
  return {
    sql: '(n.eliminado_en, n.id) < (:afterDeletedAt, :afterId)',
    parameters: { afterDeletedAt: after.deletedAt, afterId: after.id },
  };
};

/** Raíces que cumplen `query.filter`, `eliminado_en DESC, id DESC`, con su carpeta original del mismo dueño. */
export const selectTrashEntries = (
  manager: EntityManager,
  query: TrashEntriesQuery,
): Promise<TrashEntryRow[]> =>
  selectRows<TrashEntryRow>(
    manager,
    `SELECT n.tipo, n.id, n.nombre, n.clase, n.eliminado_en, n.purgar_en, n.tamano::text AS tamano,
            p.id AS padre_id, p.nombre AS padre_nombre
       FROM (${query.roots.sql}) n
       LEFT JOIN carpeta p ON p.id = n.padre_id AND p.propietario_id = :${query.ownerParameter}
      WHERE ${query.filter.sql}
      ORDER BY n.eliminado_en DESC, n.id DESC
      LIMIT :take`,
    { ...query.roots.parameters, ...query.filter.parameters, take: query.take },
  );

/** Página de `limit` raíces leídas con `limit + 1` filas; `nextCursor` (`[tipo, eliminado_en, id]`) si quedan más. */
export const trashPageOf = (rows: readonly TrashEntryRow[], limit: number): TrashPage => {
  const entries = rows.slice(0, limit).map(toEntry);
  const last = entries.at(-1);
  if (rows.length <= limit || last === undefined) return { items: entries, nextCursor: null };
  const position = { type: last.type, deletedAt: last.deletedAt, id: last.id };
  return { items: entries, nextCursor: encodeTrashCursor(position) };
};
