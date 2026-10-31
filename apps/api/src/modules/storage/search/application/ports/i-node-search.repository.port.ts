import type { Actor } from '../../../../../shared';
import type { FileKind } from '../../../domain/file-kind';
import type { StorageNode } from '../../../domain/storage-node';

/**
 * Qué buscar (spec 018): cada palabra de `terms` debe aparecer en el nombre (RN-1); `kinds` acota a esos tipos de
 * archivo y deja fuera las carpetas (RN-3); `from` inclusivo y `to` exclusivo sobre la fecha de modificación (RN-4).
 * `cursor` es el `nextCursor` opaco de la página anterior.
 */
export interface NodeSearchCriteria {
  readonly terms: readonly string[];
  readonly kinds?: readonly FileKind[];
  readonly from?: Date;
  readonly to?: Date;
  readonly limit: number;
  readonly cursor?: string;
}

/** Carpeta que contiene un resultado y que el actor ve (CA-13). */
export interface SearchLocation {
  readonly id: string;
  readonly name: string;
}

/** Un resultado y su ubicación; `null` = la raíz o una carpeta que el actor no ve. */
export interface NodeSearchHit {
  readonly node: StorageNode;
  readonly location: SearchLocation | null;
}

/** Carpetas y luego archivos, cada grupo del modificado más reciente al más antiguo (CA-2). */
export interface SearchPage {
  readonly hits: readonly NodeSearchHit[];
  readonly nextCursor: string | null;
}

/**
 * Búsqueda por nombre, tipo y fecha entre los nodos vivos que el actor ve (RN-2): `accessibleNodes(actor)` va dentro
 * de la consulta y el `EntityManager` sale de `requireActorScope(actor)` (ADR-0005). Lanza `InvalidQueryError` si el
 * cursor no lo emitió esta búsqueda.
 */
export interface INodeSearchRepository {
  search(actor: Actor, criteria: NodeSearchCriteria): Promise<SearchPage>;
}

export const I_NODE_SEARCH_REPOSITORY = Symbol('INodeSearchRepository');
