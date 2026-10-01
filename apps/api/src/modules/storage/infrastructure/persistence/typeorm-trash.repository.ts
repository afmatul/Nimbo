import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { accessibleNodes, ownedTrashedNodes } from '../../../access';
import type {
  ITrashRepository,
  TrashedFolder,
  TrashEntry,
  TrashItemType,
  TrashListQuery,
  TrashPage,
  TrashTotals,
} from '../../application/ports/i-trash.repository.port';
import type { File } from '../../domain/file';
import type { FileKind } from '../../domain/file-kind';
import type { Folder } from '../../domain/folder';
import { FolderName } from '../../domain/folder-name.vo';
import { FolderPath } from '../../domain/folder-path';
import type { TrashState } from '../../domain/trash-state';

import { ArchivoOrmEntity } from './archivo.orm-entity';
import { CarpetaOrmEntity } from './carpeta.orm-entity';
import { decodeNodeListCursor, encodeNodeListCursor } from './node-list-cursor';
import { nodesIn, rebaseSubtree } from './node-sql';
import type { Condition } from './node-sql';
import { trashColumns } from './trash-columns';
import { toFile } from './typeorm-node.repository';

/** Columnas de papelera de un nodo que vuelve. */
const LIVE = trashColumns(null);

/** Bytes de un archivo: la suma de sus versiones (plan 006 §3: lo que se muestra es lo que libera la purga). */
const FILE_BYTES_SQL =
  '(SELECT COALESCE(SUM(v.tamano_bytes), 0) FROM version_archivo v WHERE v.archivo_id = a.id)';

/** Bytes de una carpeta de la papelera: las versiones de los archivos que arrastró (RN-6, en `numeric` sin pérdida). */
const FOLDER_BYTES_SQL =
  '(SELECT COALESCE(SUM(v.tamano_bytes), 0) FROM archivo h JOIN version_archivo v ON v.archivo_id = h.id ' +
  'WHERE h.eliminado_con_carpeta_id = c.id)';

/** Raíces de la papelera del actor con su tamaño: `ownedTrashedNodes` va dentro de cada rama (ADR-0005). */
const trashRootsSql = (actor: Actor): Condition => {
  const files = nodesIn(ownedTrashedNodes(actor), 'a.id', 'archivo');
  const folders = nodesIn(ownedTrashedNodes(actor), 'c.id', 'carpeta');
  return {
    sql:
      `SELECT 'file'::text AS tipo, a.id, a.nombre, a.tipo AS clase, a.carpeta_id AS padre_id, a.eliminado_en, ` +
      `a.purgar_en, ${FILE_BYTES_SQL} AS tamano FROM archivo a WHERE ${files.sql} UNION ALL ` +
      `SELECT 'folder'::text, c.id, c.nombre, NULL, c.carpeta_padre_id, c.eliminado_en, c.purgar_en, ` +
      `${FOLDER_BYTES_SQL} FROM carpeta c WHERE ${folders.sql}`,
    parameters: { ...files.parameters, ...folders.parameters },
  };
};

/** Fila de `trashRootsSql` con su carpeta original (si sigue existiendo). */
interface TrashEntryRow {
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

const toEntry = (row: TrashEntryRow): TrashEntry => ({
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

interface TrashedFolderRow {
  readonly id: string;
  readonly propietario_id: string;
  readonly carpeta_padre_id: string | null;
  readonly nombre: string;
  readonly ruta: string;
  readonly profundidad: number;
  readonly creado_en: Date;
  readonly mas_honda: number | null;
  readonly tamano: string;
}

/** Sin `Folder.rehydrate`: tras R-5 la ruta guardada conserva ancestros que ya no son su padre (nota T-03). */
const toTrashedFolder = (row: TrashedFolderRow): TrashedFolder => ({
  id: row.id,
  ownerId: row.propietario_id,
  parentId: row.carpeta_padre_id,
  name: FolderName.of(row.nombre),
  storedPath: FolderPath.of(row.ruta),
  createdAt: row.creado_en,
  deepestCarriedDepth: Math.max(row.profundidad, row.mas_honda ?? row.profundidad),
  sizeBytes: BigInt(row.tamano),
});

/** Página con `nextCursor` en la última fila si quedan más. El cursor lleva `eliminado_en` en lugar de `creado_en`. */
const pageOf = (entries: readonly TrashEntry[], hasMore: boolean): TrashPage => {
  const last = entries.at(-1);
  if (!hasMore || last === undefined) return { items: entries, nextCursor: null };
  const position = { type: last.type, createdAt: last.deletedAt, id: last.id };
  return { items: entries, nextCursor: encodeNodeListCursor(position) };
};

/**
 * `ITrashRepository` sobre Postgres (plan 006 §2). Las raíces se leen y escriben con `ownedTrashedNodes(actor)` y lo
 * vivo con `accessibleNodes(actor)`, siempre dentro de la consulta; lo arrastrado se alcanza por
 * `eliminado_con_carpeta_id` de una raíz propia. Todo método toma el `EntityManager` de `requireActorScope(actor)`
 * (la RLS es la segunda barrera). `@Inject` explícito: con `tsx` (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmTrashRepository implements ITrashRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async markFileTrashed(actor: Actor, fileId: string, state: TrashState): Promise<void> {
    await this.update(actor, ArchivoOrmEntity, trashColumns(state), [
      nodesIn(accessibleNodes(actor), 'id', 'archivo'),
      { sql: 'id = :fileId', parameters: { fileId } },
    ]);
  }

  /** Primero los archivos (mientras sus carpetas siguen vivas), luego las subcarpetas y al final la carpeta. */
  async markFolderSubtreeTrashed(actor: Actor, folder: Folder, state: TrashState): Promise<number> {
    const carried = trashColumns(state.carriedBy(folder.id));
    const subtree = { subtree: `${folder.path.value}%` };
    const liveFolder = nodesIn(accessibleNodes(actor), 's.id', 'carpeta');
    const files = await this.update(actor, ArchivoOrmEntity, carried, [
      nodesIn(accessibleNodes(actor), 'id', 'archivo'),
      {
        sql: `carpeta_id IN (SELECT s.id FROM carpeta s WHERE s.ruta LIKE :subtree AND ${liveFolder.sql})`,
        parameters: { ...subtree, ...liveFolder.parameters },
      },
    ]);
    const folders = await this.update(actor, CarpetaOrmEntity, carried, [
      nodesIn(accessibleNodes(actor), 'id', 'carpeta'),
      {
        sql: 'ruta LIKE :subtree AND id <> :rootId',
        parameters: { ...subtree, rootId: folder.id },
      },
    ]);
    const root = await this.update(actor, CarpetaOrmEntity, trashColumns(state), [
      nodesIn(accessibleNodes(actor), 'id', 'carpeta'),
      { sql: 'id = :rootId', parameters: { rootId: folder.id } },
    ]);
    return files + folders + root;
  }

  async listTrash(actor: Actor, query: TrashListQuery): Promise<TrashPage> {
    const after = query.cursor === undefined ? null : decodeNodeListCursor(query.cursor);
    const filter: Condition =
      after === null
        ? { sql: 'true', parameters: {} }
        : {
            sql: '(n.eliminado_en, n.id) < (:afterDeletedAt, :afterId)',
            parameters: { afterDeletedAt: after.createdAt, afterId: after.id },
          };
    const rows = await this.entries(actor, filter, query.limit + 1);
    return pageOf(rows.slice(0, query.limit).map(toEntry), rows.length > query.limit);
  }

  async trashSummary(actor: Actor): Promise<TrashTotals> {
    const roots = trashRootsSql(actor);
    const [row] = await this.select<{ cantidad: number; total: string }>(
      actor,
      `SELECT count(*)::int AS cantidad, COALESCE(SUM(n.tamano), 0)::text AS total FROM (${roots.sql}) n`,
      roots.parameters,
    );
    return { itemCount: row?.cantidad ?? 0, totalBytes: BigInt(row?.total ?? '0') };
  }

  async findTrashedItem(actor: Actor, type: TrashItemType, id: string): Promise<TrashEntry | null> {
    const filter = {
      sql: 'n.tipo = :itemType AND n.id = :itemId',
      parameters: { itemType: type, itemId: id },
    };
    const [row] = await this.entries(actor, filter, 1);
    return row === undefined ? null : toEntry(row);
  }

  async findTrashedFile(actor: Actor, id: string): Promise<File | null> {
    const trashed = nodesIn(ownedTrashedNodes(actor), 'archivo.id', 'archivo');
    const row = await this.manager(actor)
      .createQueryBuilder(ArchivoOrmEntity, 'archivo')
      .where(trashed.sql, { ...trashed.parameters })
      .andWhere('archivo.id = :id', { id })
      .getOne();
    return row === null ? null : toFile(row);
  }

  async findTrashedFolder(actor: Actor, id: string): Promise<TrashedFolder | null> {
    const trashed = nodesIn(ownedTrashedNodes(actor), 'c.id', 'carpeta');
    const [row] = await this.select<TrashedFolderRow>(
      actor,
      `SELECT c.id, c.propietario_id, c.carpeta_padre_id, c.nombre, c.ruta, c.profundidad, c.creado_en,
              (SELECT MAX(h.profundidad) FROM carpeta h WHERE h.eliminado_con_carpeta_id = c.id) AS mas_honda,
              ${FOLDER_BYTES_SQL}::text AS tamano
         FROM carpeta c WHERE c.id = :folderId AND ${trashed.sql}`,
      { ...trashed.parameters, folderId: id },
    );
    return row === undefined ? null : toTrashedFolder(row);
  }

  async restoreFile(actor: Actor, restored: File): Promise<void> {
    await this.update(
      actor,
      ArchivoOrmEntity,
      {
        ...LIVE,
        carpetaId: restored.folderId,
        nombre: restored.name.value,
        actualizadoEn: restored.updatedAt,
      },
      [
        nodesIn(ownedTrashedNodes(actor), 'id', 'archivo'),
        { sql: 'id = :fileId', parameters: { fileId: restored.id } },
      ],
    );
  }

  /** Lo arrastrado antes que la raíz: mientras la raíz sigue en la papelera, `ownedTrashedNodes` la reconoce. */
  async restoreFolderSubtree(
    actor: Actor,
    before: TrashedFolder,
    restored: Folder,
  ): Promise<number> {
    const carried = this.carriedBy(actor, before.id);
    const files = await this.update(actor, ArchivoOrmEntity, LIVE, [carried]);
    const folders = await this.update(actor, CarpetaOrmEntity, LIVE, [carried]);
    const root = await this.update(
      actor,
      CarpetaOrmEntity,
      {
        ...LIVE,
        carpetaPadreId: restored.parentId,
        nombre: restored.name.value,
        actualizadoEn: restored.updatedAt,
      },
      [
        nodesIn(ownedTrashedNodes(actor), 'id', 'carpeta'),
        { sql: 'id = :rootId', parameters: { rootId: before.id } },
      ],
    );
    if (!before.storedPath.equals(restored.path)) {
      await rebaseSubtree(this.manager(actor), before.ownerId, before.storedPath, restored.path);
    }
    return files + folders + root;
  }

  /** Nodos que arrastró `folderId`, solo si es una raíz de la papelera del actor. */
  private carriedBy(actor: Actor, folderId: string): Condition {
    const root = nodesIn(ownedTrashedNodes(actor), 'eliminado_con_carpeta_id', 'carpeta');
    return {
      sql: `eliminado_con_carpeta_id = :carrierId AND ${root.sql}`,
      parameters: { ...root.parameters, carrierId: folderId },
    };
  }

  /** Raíces de la papelera que cumplen `filter`, `eliminado_en DESC, id DESC`, con su carpeta original. */
  private entries(actor: Actor, filter: Condition, take: number): Promise<TrashEntryRow[]> {
    const roots = trashRootsSql(actor);
    return this.select<TrashEntryRow>(
      actor,
      `SELECT n.tipo, n.id, n.nombre, n.clase, n.eliminado_en, n.purgar_en, n.tamano::text AS tamano,
              p.id AS padre_id, p.nombre AS padre_nombre
         FROM (${roots.sql}) n
         LEFT JOIN carpeta p ON p.id = n.padre_id AND p.propietario_id = :access_actor_id
        WHERE ${filter.sql}
        ORDER BY n.eliminado_en DESC, n.id DESC
        LIMIT :take`,
      { ...roots.parameters, ...filter.parameters, take },
    );
  }

  private async select<T>(
    actor: Actor,
    sql: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<T[]> {
    const manager = this.manager(actor);
    const [query, values] = manager.connection.driver.escapeQueryWithParameters(
      sql,
      { ...parameters },
      {},
    );
    return (await manager.query(query, values)) as T[];
  }

  /** `UPDATE` con todas las condiciones; devuelve las filas tocadas. */
  private async update<T extends ObjectLiteral>(
    actor: Actor,
    entity: new () => T,
    values: QueryDeepPartialEntity<T>,
    conditions: readonly Condition[],
  ): Promise<number> {
    const builder = this.manager(actor).createQueryBuilder().update(entity).set(values);
    conditions.forEach((condition, index) => {
      if (index === 0) builder.where(condition.sql, { ...condition.parameters });
      else builder.andWhere(condition.sql, { ...condition.parameters });
    });
    const result = await builder.execute();
    return result.affected ?? 0;
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
