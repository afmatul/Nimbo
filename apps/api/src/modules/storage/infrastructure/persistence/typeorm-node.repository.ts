import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { accessibleNodes, ownedFiles } from '../../../access';
import type {
  FileVersionRef,
  IdPage,
  INodeRepository,
  NodeListPage,
  NodeListQuery,
} from '../../application/ports/i-node.repository.port';
import { File } from '../../domain/file';
import { FileName } from '../../domain/file-name.vo';
import type { FileVersion } from '../../domain/file-version';
import { Folder } from '../../domain/folder';
import { FolderName } from '../../domain/folder-name.vo';
import { FolderPath } from '../../domain/folder-path';
import type { NodeGroup, NodeOrder } from '../../domain/node-order';
import type { StorageNode } from '../../domain/storage-node';

import { ArchivoOrmEntity } from './archivo.orm-entity';
import { CarpetaOrmEntity } from './carpeta.orm-entity';
import { decodeNodeListCursor, encodeNodeListCursor } from './node-list-cursor';
import type { NodeListPosition } from './node-list-cursor';
import { afterCondition, orderByOf } from './node-order-sql';
import { nodesIn, rebaseSubtree } from './node-sql';
import type { Condition, NodeTable } from './node-sql';
import { toTrashState, trashColumns } from './trash-columns';
import { toVersionRow } from './typeorm-version.repository';
import { VersionArchivoOrmEntity } from './version-archivo.orm-entity';

const FILE_ALIAS = 'archivo';
const FOLDER_ALIAS = 'carpeta';
/** Comodines de `LIKE` y su carácter de escape: en un nombre son texto, no patrones. */
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

const escapeLike = (text: string): string => text.replace(LIKE_SPECIAL_CHARACTERS, '\\$&');

/** Patrón `LIKE` de las copias «base (n)tail» (D-4); `tail` es «.ext» en archivos y vacío en carpetas. */
const copiesPattern = (base: string, tail: string): string =>
  `${escapeLike(base)} (%)${escapeLike(tail)}`;

const fileCopiesPattern = (name: FileName): string => {
  const extension = name.extension();
  if (extension === '') return copiesPattern(name.value, '');
  return copiesPattern(name.value.slice(0, -(extension.length + 1)), `.${extension}`);
};

/** `idColumn` está entre los nodos de `table` que el actor ve: el fragmento de `access` va dentro (ADR-0005). */
const accessibleCondition = (actor: Actor, idColumn: string, table: NodeTable): Condition =>
  nodesIn(accessibleNodes(actor), idColumn, table);

/** Hijos de `folderId`; en la raíz, `IS NULL` para que el planificador use los índices parciales de raíz (T-01). */
const childOf = (parentColumn: string, folderId: string | null): Condition =>
  folderId === null
    ? { sql: `${parentColumn} IS NULL`, parameters: {} }
    : { sql: `${parentColumn} = :parentFolderId`, parameters: { parentFolderId: folderId } };

/** Fila → `File`; también la usa `TypeOrmTrashRepository` (un archivo no guarda ruta: no hay nada que rehacer). */
export const toFile = (row: ArchivoOrmEntity): File =>
  File.rehydrate({
    id: row.id,
    ownerId: row.propietarioId,
    folderId: row.carpetaId,
    name: FileName.of(row.nombre),
    kind: row.tipo,
    sizeBytes: row.tamanoBytes,
    currentVersionId: row.versionActualId,
    createdAt: row.creadoEn,
    updatedAt: row.actualizadoEn,
    trash: toTrashState(row),
  });

const toFolder = (row: CarpetaOrmEntity): Folder =>
  Folder.rehydrate({
    id: row.id,
    ownerId: row.propietarioId,
    parentId: row.carpetaPadreId,
    name: FolderName.of(row.nombre),
    path: FolderPath.of(row.ruta),
    createdAt: row.creadoEn,
    updatedAt: row.actualizadoEn,
    trash: toTrashState(row),
  });

const toFolderRow = (folder: Folder): CarpetaOrmEntity => ({
  id: folder.id,
  propietarioId: folder.ownerId,
  carpetaPadreId: folder.parentId,
  nombre: folder.name.value,
  ruta: folder.path.value,
  profundidad: folder.depth,
  creadoEn: folder.createdAt,
  actualizadoEn: folder.updatedAt,
  ...trashColumns(folder.trash),
});

/** Página con `nextCursor` (emitido con `order`) en la última fila si quedan más. */
const pageOf = (
  order: NodeOrder,
  items: readonly StorageNode[],
  hasMore: boolean,
): NodeListPage => {
  const last = items.at(-1);
  if (!hasMore || last === undefined) return { items, nextCursor: null };
  return { items, nextCursor: encodeNodeListCursor(order, last) };
};

/** Una página de un grupo del listado: su orden (`node-order-sql`) a partir de `after` (exclusivo). */
interface GroupPage {
  readonly group: NodeGroup;
  readonly query: NodeListQuery;
  readonly after: NodeListPosition | null;
}

/**
 * Ordena `builder` (alias `alias`) por la clave del grupo y deja `limit + 1` filas para saber si hay más. `orderBy` con
 * `lower(...)` funciona porque se usa `limit` y no `take` (R-1): TypeORM no envuelve la consulta.
 */
const ordered = <T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  alias: string,
  page: GroupPage,
): SelectQueryBuilder<T> => {
  const key = page.query.order.keyFor(page.group);
  builder.orderBy().limit(page.query.limit + 1);
  orderByOf(alias, key).forEach(([column, direction]) => builder.addOrderBy(column, direction));
  if (page.after === null) return builder;
  const after = afterCondition(alias, key, page.after);
  return builder.andWhere(after.sql, after.parameters);
};

/** Nombres ocupados por `exact` o sus copias entre los hijos de `folderId`, sin `exceptId`. */
const takenNames = async <T extends { nombre: string }>(
  builder: SelectQueryBuilder<T>,
  alias: string,
  sibling: Condition,
  match: {
    readonly exact: string;
    readonly copies: string;
    readonly exceptId?: string | undefined;
  },
): Promise<readonly string[]> => {
  builder
    .select([`${alias}.id`, `${alias}.nombre`])
    .andWhere(sibling.sql, sibling.parameters)
    .andWhere(
      `(lower(${alias}.nombre) = lower(:exactName) OR lower(${alias}.nombre) LIKE lower(:copies) ESCAPE '\\')`,
      { exactName: match.exact, copies: match.copies },
    );
  if (match.exceptId !== undefined) {
    builder.andWhere(`${alias}.id <> :exceptId`, { exceptId: match.exceptId });
  }
  const rows = await builder.getMany();
  return rows.map((row) => row.nombre);
};

/**
 * `INodeRepository` sobre Postgres (plan 005 §6 «Puertos», plan 006 §2). Toda lectura y toda escritura por id une
 * `accessibleNodes(actor)` (filtrado por `tipo_nodo`) en la misma consulta y todo método toma el `EntityManager` de
 * `requireActorScope(actor)`: la RLS es la segunda barrera, no la única. `@Inject` explícito: con `tsx` (esbuild) no
 * hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmNodeRepository implements INodeRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async findAccessibleById(actor: Actor, id: string): Promise<File | null> {
    const row = await this.liveFiles(actor).andWhere(`${FILE_ALIAS}.id = :id`, { id }).getOne();
    return row === null ? null : toFile(row);
  }

  async findOwnedFile(actor: Actor, id: string): Promise<File | null> {
    const row = await this.ownedFileRows(actor).andWhere(`${FILE_ALIAS}.id = :id`, { id }).getOne();
    return row === null ? null : toFile(row);
  }

  async listOwnedFiles(actor: Actor, page: IdPage): Promise<readonly File[]> {
    const builder = this.ownedFileRows(actor).orderBy(`${FILE_ALIAS}.id`, 'ASC').limit(page.limit);
    if (page.afterId !== null) {
      builder.andWhere(`${FILE_ALIAS}.id > :afterId`, { afterId: page.afterId });
    }
    return (await builder.getMany()).map(toFile);
  }

  /** `FOR SHARE` solo del archivo (`archivo` de la consulta exterior; el fragmento de `access` no se bloquea). */
  async lockCurrentVersion(actor: Actor, ref: FileVersionRef): Promise<boolean> {
    const row = await this.ownedFileRows(actor)
      .select(`${FILE_ALIAS}.id`)
      .andWhere(`${FILE_ALIAS}.id = :fileId`, { fileId: ref.fileId })
      .andWhere(`${FILE_ALIAS}.versionActualId = :versionId`, { versionId: ref.versionId })
      .setLock('pessimistic_read')
      .getOne();
    return row !== null;
  }

  async findLiveFileByName(
    actor: Actor,
    name: FileName,
    folderId: string | null,
  ): Promise<File | null> {
    const sibling = childOf(`${FILE_ALIAS}.carpetaId`, folderId);
    const row = await this.liveFiles(actor)
      .andWhere(sibling.sql, sibling.parameters)
      .andWhere(`lower(${FILE_ALIAS}.nombre) = lower(:name)`, { name: name.value })
      .getOne();
    return row === null ? null : toFile(row);
  }

  async findAccessibleFolder(actor: Actor, id: string): Promise<Folder | null> {
    const row = await this.liveFolders(actor).andWhere(`${FOLDER_ALIAS}.id = :id`, { id }).getOne();
    return row === null ? null : toFolder(row);
  }

  /**
   * Dos consultas, carpetas y luego archivos, en lugar de un `UNION ALL` de entidades distintas (006 R-2); cada una en
   * la clave de su grupo (007 D-7). Un cursor de archivos salta las carpetas.
   */
  async listContents(actor: Actor, query: NodeListQuery): Promise<NodeListPage> {
    const { order, limit, cursor } = query;
    const after = cursor === undefined ? null : decodeNodeListCursor(cursor, order);
    const folders =
      after?.group === 'file'
        ? []
        : await this.childFolders(actor, { group: 'folder', query, after });
    if (folders.length > limit) return pageOf(order, folders.slice(0, limit), true);
    const room = limit - folders.length;
    const files = await this.childFiles(actor, {
      group: 'file',
      query: { ...query, limit: room },
      after: after?.group === 'file' ? after : null,
    });
    return pageOf(order, [...folders, ...files.slice(0, room)], files.length > room);
  }

  async breadcrumbs(actor: Actor, folder: Folder): Promise<readonly Folder[]> {
    const ancestorIds = folder.path.ancestorIds();
    if (ancestorIds.length === 0) return [];
    const rows = await this.liveFolders(actor)
      .andWhere(`${FOLDER_ALIAS}.id IN (:...ancestorIds)`, { ancestorIds })
      .orderBy(`${FOLDER_ALIAS}.profundidad`, 'ASC')
      .getMany();
    return rows.map(toFolder);
  }

  findTakenNames(
    actor: Actor,
    name: FileName,
    folderId: string | null,
    exceptId?: string,
  ): Promise<readonly string[]> {
    return takenNames(
      this.liveFiles(actor),
      FILE_ALIAS,
      childOf(`${FILE_ALIAS}.carpetaId`, folderId),
      { exact: name.value, copies: fileCopiesPattern(name), exceptId },
    );
  }

  findTakenFolderNames(
    actor: Actor,
    name: FolderName,
    parentId: string | null,
    exceptId?: string,
  ): Promise<readonly string[]> {
    return takenNames(
      this.liveFolders(actor),
      FOLDER_ALIAS,
      childOf(`${FOLDER_ALIAS}.carpetaPadreId`, parentId),
      { exact: name.value, copies: copiesPattern(name.value, ''), exceptId },
    );
  }

  /** La ruta solo lleva UUID y «/» (`FolderPath`): no hay comodines que escapar en el prefijo. */
  async maxSubtreeDepth(actor: Actor, folder: Folder): Promise<number> {
    const row = await this.liveFolders(actor)
      .select(`MAX(${FOLDER_ALIAS}.profundidad)`, 'deepest')
      .andWhere(`${FOLDER_ALIAS}.ruta LIKE :subtree`, { subtree: `${folder.path.value}%` })
      .getRawOne<{ deepest: number | null }>();
    return row?.deepest ?? folder.depth;
  }

  async insertWithVersion(actor: Actor, file: File, version: FileVersion): Promise<void> {
    const manager = this.context.requireActorScope(actor);
    await manager.insert(ArchivoOrmEntity, {
      id: file.id,
      propietarioId: file.ownerId,
      carpetaId: file.folderId,
      nombre: file.name.value,
      tipo: file.kind,
      tamanoBytes: file.sizeBytes,
      versionActualId: file.currentVersionId,
      creadoEn: file.createdAt,
      actualizadoEn: file.updatedAt,
      ...trashColumns(file.trash),
    });
    await manager.insert(VersionArchivoOrmEntity, toVersionRow(version));
  }

  async insertFolder(actor: Actor, folder: Folder): Promise<void> {
    await this.context.requireActorScope(actor).insert(CarpetaOrmEntity, toFolderRow(folder));
  }

  /** Por el fragmento de acceso o por propiedad (incluida la papelera, 016 RN-11), en la misma consulta. */
  async updateCurrentVersion(actor: Actor, file: File): Promise<void> {
    const access = accessibleCondition(actor, 'id', 'archivo');
    const owned = nodesIn(ownedFiles(actor), 'id', 'archivo');
    await this.context
      .requireActorScope(actor)
      .createQueryBuilder()
      .update(ArchivoOrmEntity)
      .set({
        versionActualId: file.currentVersionId,
        tamanoBytes: file.sizeBytes,
        actualizadoEn: file.updatedAt,
      })
      .where(`(${access.sql} OR ${owned.sql})`, { ...access.parameters, ...owned.parameters })
      .andWhere('id = :id', { id: file.id })
      .execute();
  }

  renameFolder(actor: Actor, folder: Folder): Promise<void> {
    return this.updateAccessible(actor, CarpetaOrmEntity, 'carpeta', folder.id, {
      nombre: folder.name.value,
      actualizadoEn: folder.updatedAt,
    });
  }

  renameFile(actor: Actor, file: File): Promise<void> {
    return this.updateAccessible(actor, ArchivoOrmEntity, 'archivo', file.id, {
      nombre: file.name.value,
      actualizadoEn: file.updatedAt,
    });
  }

  moveFile(actor: Actor, file: File): Promise<void> {
    return this.updateAccessible(actor, ArchivoOrmEntity, 'archivo', file.id, {
      carpetaId: file.folderId,
      nombre: file.name.value,
      actualizadoEn: file.updatedAt,
    });
  }

  /**
   * Primero el padre de la carpeta (por el fragmento de acceso); después, un `UPDATE` por prefijo de `ruta` que reubica
   * todo el subárbol del dueño, incluida la propia carpeta y lo que está en la papelera (al restaurarse vuelve a una
   * ruta coherente). `idx_carpeta_ruta` sirve al prefijo.
   */
  async moveFolderSubtree(actor: Actor, before: Folder, moved: Folder): Promise<void> {
    await this.updateAccessible(actor, CarpetaOrmEntity, 'carpeta', before.id, {
      carpetaPadreId: moved.parentId,
      actualizadoEn: moved.updatedAt,
    });
    await rebaseSubtree(
      this.context.requireActorScope(actor),
      before.ownerId,
      before.path,
      moved.path,
    );
  }

  /** Archivos vivos que el actor ve. */
  private liveFiles(actor: Actor): SelectQueryBuilder<ArchivoOrmEntity> {
    return this.liveNodes(actor, ArchivoOrmEntity, FILE_ALIAS, 'archivo');
  }

  /** Archivos del actor, vivos o en la papelera (`ownedFiles`, PD-112). */
  private ownedFileRows(actor: Actor): SelectQueryBuilder<ArchivoOrmEntity> {
    const owned = nodesIn(ownedFiles(actor), `${FILE_ALIAS}.id`, 'archivo');
    return this.context
      .requireActorScope(actor)
      .createQueryBuilder(ArchivoOrmEntity, FILE_ALIAS)
      .where(owned.sql, { ...owned.parameters });
  }

  /** Carpetas vivas que el actor ve. */
  private liveFolders(actor: Actor): SelectQueryBuilder<CarpetaOrmEntity> {
    return this.liveNodes(actor, CarpetaOrmEntity, FOLDER_ALIAS, 'carpeta');
  }

  private liveNodes<T extends ObjectLiteral>(
    actor: Actor,
    entity: new () => T,
    alias: string,
    table: NodeTable,
  ): SelectQueryBuilder<T> {
    const manager: EntityManager = this.context.requireActorScope(actor);
    const access = accessibleCondition(actor, `${alias}.id`, table);
    return manager
      .createQueryBuilder(entity, alias)
      .where(access.sql, { ...access.parameters })
      .andWhere(`${alias}.eliminadoEn IS NULL`);
  }

  private async childFolders(actor: Actor, page: GroupPage): Promise<Folder[]> {
    const children = childOf(`${FOLDER_ALIAS}.carpetaPadreId`, page.query.folderId);
    const builder = this.liveFolders(actor).andWhere(children.sql, children.parameters);
    const rows = await ordered(builder, FOLDER_ALIAS, page).getMany();
    return rows.map(toFolder);
  }

  private async childFiles(actor: Actor, page: GroupPage): Promise<File[]> {
    const children = childOf(`${FILE_ALIAS}.carpetaId`, page.query.folderId);
    const builder = this.liveFiles(actor).andWhere(children.sql, children.parameters);
    const rows = await ordered(builder, FILE_ALIAS, page).getMany();
    return rows.map(toFile);
  }

  /** `UPDATE` de un nodo por id, solo si el actor lo ve vivo (mismo fragmento que las lecturas). */
  private async updateAccessible<T extends ObjectLiteral>(
    actor: Actor,
    entity: new () => T,
    table: NodeTable,
    id: string,
    values: QueryDeepPartialEntity<T>,
  ): Promise<void> {
    const access = accessibleCondition(actor, 'id', table);
    await this.context
      .requireActorScope(actor)
      .createQueryBuilder()
      .update(entity)
      .set(values)
      .where(access.sql, { ...access.parameters })
      .andWhere('id = :id', { id })
      .execute();
  }
}
