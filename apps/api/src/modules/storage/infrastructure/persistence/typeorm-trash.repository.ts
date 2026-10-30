import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { ownedNodes, ownedTrashedNodes } from '../../../access';
import type {
  ITrashRepository,
  PurgeFile,
  TrashedFolder,
  TrashEntry,
  TrashItemRef,
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
import {
  COUNTED_VERSION_SQL,
  FILE_BYTES_SQL,
  nodesIn,
  rebaseSubtree,
  selectRows,
} from './node-sql';
import type { Condition, NodeTable } from './node-sql';
import { trashColumns } from './trash-columns';
import { decodeTrashCursor, encodeTrashCursor } from './trash-cursor';
import { toFile } from './typeorm-node.repository';

/** Columnas de papelera de un nodo que vuelve. */
const LIVE = trashColumns(null);

/**
 * Bytes de una carpeta de la papelera: las versiones que cuentan de los archivos que arrastró (RN-6, 014b CA-10; en
 * `numeric` sin pérdida).
 */
const FOLDER_BYTES_SQL =
  '(SELECT COALESCE(SUM(v.tamano_bytes), 0) FROM archivo h JOIN version_archivo v ON v.archivo_id = h.id ' +
  `WHERE h.eliminado_con_carpeta_id = c.id AND ${COUNTED_VERSION_SQL})`;

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

/** Fila de `purgeTargets`: un archivo con lo que libera (sus versiones que cuentan) y las claves de todas. */
interface PurgeFileRow {
  readonly id: string;
  readonly tamano: string;
  readonly claves: string[];
}

const toPurgeFile = (row: PurgeFileRow): PurgeFile => ({
  id: row.id,
  sizeBytes: BigInt(row.tamano),
  objectKeys: row.claves,
});

/** Tabla y alias de cada tipo de raíz de la papelera. */
const ROOT_TABLE: Readonly<Record<TrashItemType, { table: NodeTable; alias: string }>> = {
  file: { table: 'archivo', alias: 'a' },
  folder: { table: 'carpeta', alias: 'c' },
};

/** Página con `nextCursor` (`[tipo, eliminado_en, id]`) en la última fila si quedan más. */
const pageOf = (entries: readonly TrashEntry[], hasMore: boolean): TrashPage => {
  const last = entries.at(-1);
  if (!hasMore || last === undefined) return { items: entries, nextCursor: null };
  const position = { type: last.type, deletedAt: last.deletedAt, id: last.id };
  return { items: entries, nextCursor: encodeTrashCursor(position) };
};

/**
 * `ITrashRepository` sobre Postgres (plan 006 §2). Las raíces se leen y escriben con `ownedTrashedNodes(actor)` y lo
 * vivo con `ownedNodes(actor)` (lo compartido no se elimina, 012 CA-14), siempre dentro de la consulta; lo arrastrado
 * se alcanza por `eliminado_con_carpeta_id` de una raíz propia. Todo método toma el `EntityManager` de
 * `requireActorScope(actor)` (la RLS es la segunda barrera). `@Inject` explícito: con `tsx` (esbuild) no hay
 * `design:paramtypes`.
 */
@Injectable()
export class TypeOrmTrashRepository implements ITrashRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async markFileTrashed(actor: Actor, fileId: string, state: TrashState): Promise<void> {
    await this.update(actor, ArchivoOrmEntity, trashColumns(state), [
      nodesIn(ownedNodes(actor), 'id', 'archivo'),
      { sql: 'id = :fileId', parameters: { fileId } },
    ]);
  }

  /** Primero los archivos (mientras sus carpetas siguen vivas), luego las subcarpetas y al final la carpeta. */
  async markFolderSubtreeTrashed(actor: Actor, folder: Folder, state: TrashState): Promise<number> {
    const carried = trashColumns(state.carriedBy(folder.id));
    const subtree = { subtree: `${folder.path.value}%` };
    const liveFolder = nodesIn(ownedNodes(actor), 's.id', 'carpeta');
    const files = await this.update(actor, ArchivoOrmEntity, carried, [
      nodesIn(ownedNodes(actor), 'id', 'archivo'),
      {
        sql: `carpeta_id IN (SELECT s.id FROM carpeta s WHERE s.ruta LIKE :subtree AND ${liveFolder.sql})`,
        parameters: { ...subtree, ...liveFolder.parameters },
      },
    ]);
    const folders = await this.update(actor, CarpetaOrmEntity, carried, [
      nodesIn(ownedNodes(actor), 'id', 'carpeta'),
      {
        sql: 'ruta LIKE :subtree AND id <> :rootId',
        parameters: { ...subtree, rootId: folder.id },
      },
    ]);
    const root = await this.update(actor, CarpetaOrmEntity, trashColumns(state), [
      nodesIn(ownedNodes(actor), 'id', 'carpeta'),
      { sql: 'id = :rootId', parameters: { rootId: folder.id } },
    ]);
    return files + folders + root;
  }

  async listTrash(actor: Actor, query: TrashListQuery): Promise<TrashPage> {
    const after = query.cursor === undefined ? null : decodeTrashCursor(query.cursor);
    const filter: Condition =
      after === null
        ? { sql: 'true', parameters: {} }
        : {
            sql: '(n.eliminado_en, n.id) < (:afterDeletedAt, :afterId)',
            parameters: { afterDeletedAt: after.deletedAt, afterId: after.id },
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

  async purgeTargets(
    actor: Actor,
    item: TrashItemRef,
    dueBy: Date | null,
  ): Promise<readonly PurgeFile[] | null> {
    if (!(await this.isDueRoot(actor, item, dueBy))) return null;
    const files: Condition =
      item.type === 'file'
        ? { sql: 'a.id = :rootId', parameters: { rootId: item.id } }
        : this.carriedBy(actor, item.id, 'a.eliminado_con_carpeta_id');
    const rows = await this.select<PurgeFileRow>(
      actor,
      `SELECT a.id, COALESCE(SUM(v.tamano_bytes) FILTER (WHERE ${COUNTED_VERSION_SQL}), 0)::text AS tamano,
              COALESCE(array_agg(v.clave_objeto ORDER BY v.creada_en) FILTER (WHERE v.id IS NOT NULL), '{}') AS claves
         FROM archivo a LEFT JOIN version_archivo v ON v.archivo_id = a.id
        WHERE ${files.sql}
        GROUP BY a.id ORDER BY a.id`,
      files.parameters,
    );
    return rows.map(toPurgeFile);
  }

  /** La raíz propia o un archivo que arrastró una carpeta raíz propia; `version_archivo` cae por `ON DELETE CASCADE`. */
  async deleteFileRows(actor: Actor, fileId: string): Promise<void> {
    const root = nodesIn(ownedTrashedNodes(actor), 'id', 'archivo');
    const carried = this.carriedBy(actor, null);
    await this.delete(actor, ArchivoOrmEntity, {
      sql: `id = :fileId AND (${root.sql} OR ${carried.sql})`,
      parameters: { ...root.parameters, ...carried.parameters, fileId },
    });
  }

  /**
   * La raíz y lo que arrastró en un solo `DELETE` (la FK de `eliminado_con_carpeta_id` se comprueba al final de la
   * sentencia). Lo eliminado aparte debajo queda en la raíz por `SET NULL` (R-5).
   */
  async deleteFolderRows(actor: Actor, folderId: string): Promise<number> {
    const root = nodesIn(ownedTrashedNodes(actor), 'id', 'carpeta');
    const carried = this.carriedBy(actor, folderId);
    return this.delete(actor, CarpetaOrmEntity, {
      sql:
        `((id = :rootId AND ${root.sql}) OR ${carried.sql}) AND NOT EXISTS ` +
        '(SELECT 1 FROM archivo h WHERE h.eliminado_con_carpeta_id = :rootId)',
      parameters: { ...root.parameters, ...carried.parameters, rootId: folderId },
    });
  }

  /** Solo las raíces que vencen después de `at`: lo ya vencido conserva su fecha. */
  async schedulePurgeOfAll(actor: Actor, at: Date): Promise<void> {
    const later = { sql: 'purgar_en > :at', parameters: { at } };
    await this.update(actor, ArchivoOrmEntity, { purgarEn: at }, [
      nodesIn(ownedTrashedNodes(actor), 'id', 'archivo'),
      later,
    ]);
    await this.update(actor, CarpetaOrmEntity, { purgarEn: at }, [
      nodesIn(ownedTrashedNodes(actor), 'id', 'carpeta'),
      later,
    ]);
  }

  /** `item` es una raíz de la papelera del actor y, con `dueBy`, ya venció. */
  private async isDueRoot(actor: Actor, item: TrashItemRef, dueBy: Date | null): Promise<boolean> {
    const { table, alias } = ROOT_TABLE[item.type];
    const root = nodesIn(ownedTrashedNodes(actor), `${alias}.id`, table);
    const due = dueBy === null ? '' : ` AND ${alias}.purgar_en <= :dueBy`;
    const rows = await this.select<{ id: string }>(
      actor,
      `SELECT ${alias}.id FROM ${table} ${alias} WHERE ${alias}.id = :rootId AND ${root.sql}${due}`,
      { ...root.parameters, rootId: item.id, ...(dueBy === null ? {} : { dueBy }) },
    );
    return rows.length > 0;
  }

  /**
   * Nodos que arrastró `folderId` (o, con `null`, cualquier carpeta), solo si es una raíz de la papelera del actor.
   * `column` es la `eliminado_con_carpeta_id` de la consulta, con alias si lo hay.
   */
  private carriedBy(
    actor: Actor,
    folderId: string | null,
    column = 'eliminado_con_carpeta_id',
  ): Condition {
    const root = nodesIn(ownedTrashedNodes(actor), column, 'carpeta');
    if (folderId === null) return root;
    return {
      sql: `${column} = :carrierId AND ${root.sql}`,
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

  private select<T>(
    actor: Actor,
    sql: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<T[]> {
    return selectRows<T>(this.manager(actor), sql, parameters);
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

  /** `DELETE` con la condición; devuelve las filas borradas. */
  private async delete<T extends ObjectLiteral>(
    actor: Actor,
    entity: new () => T,
    condition: Condition,
  ): Promise<number> {
    const result = await this.manager(actor)
      .createQueryBuilder()
      .delete()
      .from(entity)
      .where(condition.sql, { ...condition.parameters })
      .execute();
    return result.affected ?? 0;
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
