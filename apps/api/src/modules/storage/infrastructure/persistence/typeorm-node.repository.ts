import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { accessibleNodes } from '../../../access';
import type {
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
import type { StorageNode } from '../../domain/storage-node';

import { ArchivoOrmEntity } from './archivo.orm-entity';
import { CarpetaOrmEntity } from './carpeta.orm-entity';
import { decodeNodeListCursor, encodeNodeListCursor } from './node-list-cursor';
import type { NodeListPosition } from './node-list-cursor';
import { toTrashState, trashColumns } from './trash-columns';
import { VersionArchivoOrmEntity } from './version-archivo.orm-entity';

const FILE_ALIAS = 'archivo';
const FOLDER_ALIAS = 'carpeta';
/** `tipo_nodo` de `accessibleNodes`: el fragmento mezcla archivos y carpetas (plan 006 §2). */
type NodeTable = 'archivo' | 'carpeta';
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

/** SQL con sus parámetros con nombre, para un `andWhere` de TypeORM. */
interface Condition {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** `idColumn` está entre los nodos de `table` que el actor ve: el fragmento de `access` va dentro (ADR-0005). */
const accessibleCondition = (actor: Actor, idColumn: string, table: NodeTable): Condition => {
  const fragment = accessibleNodes(actor);
  return {
    sql: `${idColumn} IN (SELECT nodo_id FROM (${fragment.sql}) accesibles WHERE accesibles.tipo_nodo = '${table}')`,
    parameters: fragment.parameters,
  };
};

/** Hijos de `folderId`; en la raíz, `IS NULL` para que el planificador use los índices parciales de raíz (T-01). */
const childOf = (parentColumn: string, folderId: string | null): Condition =>
  folderId === null
    ? { sql: `${parentColumn} IS NULL`, parameters: {} }
    : { sql: `${parentColumn} = :parentFolderId`, parameters: { parentFolderId: folderId } };

const toFile = (row: ArchivoOrmEntity): File =>
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

/** Página con `nextCursor` en la última fila si quedan más. */
const pageOf = <T extends StorageNode>(
  items: readonly T[],
  hasMore: boolean,
): { items: readonly T[]; nextCursor: string | null } => {
  const last = items.at(-1);
  if (!hasMore || last === undefined) return { items, nextCursor: null };
  const position = { type: last.type, createdAt: last.createdAt, id: last.id };
  return { items, nextCursor: encodeNodeListCursor(position) };
};

/** Orden del listado (`creado_en DESC, id DESC`) a partir de `after` (exclusivo), con `take` filas como máximo. */
const newestFirst = <T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  alias: string,
  after: NodeListPosition | null,
  take: number,
): SelectQueryBuilder<T> => {
  builder.orderBy(`${alias}.creadoEn`, 'DESC').addOrderBy(`${alias}.id`, 'DESC').limit(take);
  if (after === null) return builder;
  return builder.andWhere(`(${alias}.creadoEn, ${alias}.id) < (:afterCreatedAt, :afterId)`, {
    afterCreatedAt: after.createdAt,
    afterId: after.id,
  });
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

  async findAccessibleFolder(actor: Actor, id: string): Promise<Folder | null> {
    const row = await this.liveFolders(actor).andWhere(`${FOLDER_ALIAS}.id = :id`, { id }).getOne();
    return row === null ? null : toFolder(row);
  }

  /** Dos consultas indexadas, carpetas y luego archivos, en lugar de un `UNION ALL` de entidades distintas (R-2). */
  async listContents(actor: Actor, query: NodeListQuery): Promise<NodeListPage> {
    const after = query.cursor === undefined ? null : decodeNodeListCursor(query.cursor);
    const folders =
      after?.type === 'file' ? [] : await this.childFolders(actor, query, after, query.limit + 1);
    if (folders.length > query.limit) return pageOf(folders.slice(0, query.limit), true);
    const room = query.limit - folders.length;
    const files = await this.childFiles(
      actor,
      query,
      after?.type === 'file' ? after : null,
      room + 1,
    );
    return pageOf([...folders, ...files.slice(0, room)], files.length > room);
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
    await manager.insert(VersionArchivoOrmEntity, {
      id: version.id,
      archivoId: version.fileId,
      origen: version.origin,
      claveObjeto: version.objectKey.value,
      tamanoBytes: version.sizeBytes,
      creadoPor: version.createdBy,
      creadaEn: version.createdAt,
    });
  }

  async insertFolder(actor: Actor, folder: Folder): Promise<void> {
    await this.context.requireActorScope(actor).insert(CarpetaOrmEntity, toFolderRow(folder));
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
    await this.context.requireActorScope(actor).query(
      `UPDATE carpeta SET ruta = $1 || substr(ruta, $2), profundidad = profundidad + $3
        WHERE propietario_id = $4 AND ruta LIKE $5`,
      [
        moved.path.value,
        before.path.value.length + 1,
        moved.depth - before.depth,
        before.ownerId,
        `${before.path.value}%`,
      ],
    );
  }

  /** Archivos vivos que el actor ve. */
  private liveFiles(actor: Actor): SelectQueryBuilder<ArchivoOrmEntity> {
    return this.liveNodes(actor, ArchivoOrmEntity, FILE_ALIAS, 'archivo');
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

  private async childFolders(
    actor: Actor,
    query: NodeListQuery,
    after: NodeListPosition | null,
    take: number,
  ): Promise<Folder[]> {
    const children = childOf(`${FOLDER_ALIAS}.carpetaPadreId`, query.folderId);
    const builder = this.liveFolders(actor).andWhere(children.sql, children.parameters);
    const rows = await newestFirst(builder, FOLDER_ALIAS, after, take).getMany();
    return rows.map(toFolder);
  }

  private async childFiles(
    actor: Actor,
    query: NodeListQuery,
    after: NodeListPosition | null,
    take: number,
  ): Promise<File[]> {
    const children = childOf(`${FILE_ALIAS}.carpetaId`, query.folderId);
    const builder = this.liveFiles(actor).andWhere(children.sql, children.parameters);
    const rows = await newestFirst(builder, FILE_ALIAS, after, take).getMany();
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
