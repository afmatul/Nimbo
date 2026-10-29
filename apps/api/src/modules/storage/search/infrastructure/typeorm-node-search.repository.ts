import { Inject, Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { escapeLike, TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { accessibleNodes } from '../../../access';
import { NodeOrder } from '../../domain/node-order';
import type { NodeGroup } from '../../domain/node-order';
import type { StorageNode } from '../../domain/storage-node';
import { ArchivoOrmEntity } from '../../infrastructure/persistence/archivo.orm-entity';
import { CarpetaOrmEntity } from '../../infrastructure/persistence/carpeta.orm-entity';
import {
  decodeNodeListCursor,
  encodeNodeListCursor,
} from '../../infrastructure/persistence/node-list-cursor';
import type { NodeListPosition } from '../../infrastructure/persistence/node-list-cursor';
import { afterCondition, orderByOf } from '../../infrastructure/persistence/node-order-sql';
import { nodesIn } from '../../infrastructure/persistence/node-sql';
import type { Condition, NodeTable } from '../../infrastructure/persistence/node-sql';
import { toFile, toFolder } from '../../infrastructure/persistence/typeorm-node.repository';
import type {
  INodeSearchRepository,
  NodeSearchCriteria,
  NodeSearchHit,
  SearchLocation,
  SearchPage,
} from '../application/ports/i-node-search.repository.port';

/** Orden fijo de la búsqueda (CA-2): el del explorador por fecha de modificación, del más reciente al más antiguo. */
const ORDER = NodeOrder.of('updated', 'desc');
const LOCATION_ALIAS = 'ubicacion';

/**
 * Plegado de D-1, aplicado igual al nombre y a cada palabra: vocales con tilde, grave, circunflejo o diéresis y la
 * cedilla, en minúscula y en mayúscula, pasan a su minúscula sin marca; la `Ñ` pasa a `ñ` (no a `n`, RN-1). Así a
 * `lower()` solo le queda el ASCII, que pliega igual con cualquier `LC_CTYPE`. Se exporta para probar eso último.
 */
export const FOLD_FROM = 'áàâäéèêëíìîïóòôöúùûüçÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇÑ';
export const FOLD_TO = 'aaaaeeeeiiiioooouuuucaaaaeeeeiiiioooouuuucñ';

const folded = (expression: string): string =>
  `lower(translate(${expression}, :foldFrom, :foldTo))`;

/** Una condición `LIKE` por palabra sobre el nombre plegado; los comodines del texto son literales (CA-4). */
const nameMatches = (alias: string, terms: readonly string[]): Condition => {
  const parameters: Record<string, unknown> = { foldFrom: FOLD_FROM, foldTo: FOLD_TO };
  const clauses = terms.map((term, index) => {
    parameters[`term${String(index)}`] = escapeLike(term);
    return `${folded(`${alias}.nombre`)} LIKE '%' || ${folded(`:term${String(index)}`)} || '%' ESCAPE '\\'`;
  });
  return { sql: clauses.join(' AND '), parameters };
};

/** Cómo se busca en cada tabla de nodos: carpetas y archivos van en consultas separadas, como `listContents`. */
interface SearchGroup<T extends ObjectLiteral> {
  readonly group: NodeGroup;
  readonly entity: new () => T;
  readonly alias: string;
  readonly table: NodeTable;
  /** Propiedad con la carpeta que contiene el nodo (su ubicación). */
  readonly parentProperty: string;
  readonly toNode: (row: T) => StorageNode;
  /** Condiciones propias del grupo además del nombre. */
  readonly filters: (criteria: NodeSearchCriteria) => readonly Condition[];
}

const FOLDERS: SearchGroup<CarpetaOrmEntity> = {
  group: 'folder',
  entity: CarpetaOrmEntity,
  alias: 'carpeta',
  table: 'carpeta',
  parentProperty: 'carpetaPadreId',
  toNode: toFolder,
  filters: () => [],
};

const FILES: SearchGroup<ArchivoOrmEntity> = {
  group: 'file',
  entity: ArchivoOrmEntity,
  alias: 'archivo',
  table: 'archivo',
  parentProperty: 'carpetaId',
  toNode: toFile,
  filters: () => [],
};

/** Página pedida a un grupo: los criterios (con el `limit` que le queda) a partir de `after` (exclusivo). */
interface GroupPage {
  readonly criteria: NodeSearchCriteria;
  readonly after: NodeListPosition | null;
}

/** Fila cruda de `getRawAndEntities`: el id del nodo y su ubicación (nula si no hay o el actor no la ve). */
type LocationRow = Readonly<Record<string, string | null>>;

const locationOf = (row: LocationRow | undefined): SearchLocation | null => {
  const id = row?.[`${LOCATION_ALIAS}_id`] ?? null;
  const name = row?.[`${LOCATION_ALIAS}_nombre`] ?? null;
  return id === null || name === null ? null : { id, name };
};

/** Página con `nextCursor` (emitido con `ORDER`) en el último resultado si quedan más. */
const pageOf = (hits: readonly NodeSearchHit[], hasMore: boolean): SearchPage => {
  const last = hits.at(-1);
  if (!hasMore || last === undefined) return { hits, nextCursor: null };
  return { hits, nextCursor: encodeNodeListCursor(ORDER, last.node) };
};

/** `limit + 1` filas en el orden del grupo, a partir de `after`. `limit` y no `take`: TypeORM no envuelve la consulta. */
const ordered = <T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  alias: string,
  page: GroupPage,
): SelectQueryBuilder<T> => {
  builder.limit(page.criteria.limit + 1);
  orderByOf(alias, ORDER).forEach(([column, direction]) => builder.addOrderBy(column, direction));
  if (page.after === null) return builder;
  const after = afterCondition(alias, ORDER, page.after);
  return builder.andWhere(after.sql, after.parameters);
};

/**
 * `INodeSearchRepository` sobre Postgres (plan 018 §3): dos consultas, carpetas y luego archivos, cada una con
 * `accessibleNodes(actor)` dentro del `WHERE` y del `JOIN` de la ubicación, sobre el `EntityManager` de
 * `requireActorScope(actor)`; la RLS es la segunda barrera. Un cursor de archivos salta las carpetas.
 */
@Injectable()
export class TypeOrmNodeSearchRepository implements INodeSearchRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async search(actor: Actor, criteria: NodeSearchCriteria): Promise<SearchPage> {
    const { limit, cursor } = criteria;
    const after = cursor === undefined ? null : decodeNodeListCursor(cursor, ORDER);
    const folders =
      after?.group === 'file' ? [] : await this.hits(actor, FOLDERS, { criteria, after });
    if (folders.length > limit) return pageOf(folders.slice(0, limit), true);
    const room = limit - folders.length;
    const files = await this.hits(actor, FILES, {
      criteria: { ...criteria, limit: room },
      after: after?.group === 'file' ? after : null,
    });
    return pageOf([...folders, ...files.slice(0, room)], files.length > room);
  }

  private async hits<T extends ObjectLiteral>(
    actor: Actor,
    group: SearchGroup<T>,
    page: GroupPage,
  ): Promise<NodeSearchHit[]> {
    const builder = this.liveRowsWithLocation(actor, group);
    const name = nameMatches(group.alias, page.criteria.terms);
    builder.andWhere(name.sql, name.parameters);
    group
      .filters(page.criteria)
      .forEach((filter) => builder.andWhere(filter.sql, filter.parameters));
    const { entities, raw } = await ordered(
      builder,
      group.alias,
      page,
    ).getRawAndEntities<LocationRow>();
    const rowById = new Map(raw.map((row) => [row[`${group.alias}_id`], row]));
    return entities.map((entity) => {
      const node = group.toNode(entity);
      return { node, location: locationOf(rowById.get(node.id)) };
    });
  }

  /** Nodos vivos del grupo que el actor ve, con su carpeta contenedora solo si también la ve (CA-13). */
  private liveRowsWithLocation<T extends ObjectLiteral>(
    actor: Actor,
    group: SearchGroup<T>,
  ): SelectQueryBuilder<T> {
    const access = nodesIn(accessibleNodes(actor), `${group.alias}.id`, group.table);
    const visibleLocation = nodesIn(accessibleNodes(actor), `${LOCATION_ALIAS}.id`, 'carpeta');
    return this.context
      .requireActorScope(actor)
      .createQueryBuilder(group.entity, group.alias)
      .leftJoin(
        CarpetaOrmEntity,
        LOCATION_ALIAS,
        `${LOCATION_ALIAS}.id = ${group.alias}.${group.parentProperty} AND ${visibleLocation.sql}`,
        { ...visibleLocation.parameters },
      )
      .addSelect([`${LOCATION_ALIAS}.id`, `${LOCATION_ALIAS}.nombre`])
      .where(access.sql, { ...access.parameters })
      .andWhere(`${group.alias}.eliminadoEn IS NULL`);
  }
}
