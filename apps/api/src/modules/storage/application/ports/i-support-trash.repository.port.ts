import type { Actor } from '../../../../shared';
import type { RestoreResult } from '../trash.service';

import type { TrashItemRef, TrashListQuery, TrashPage } from './i-trash.repository.port';

/** Página de la papelera del cliente `ownerId` que pide Soporte (spec 011b CA-10). */
export interface SupportTrashQuery extends TrashListQuery {
  readonly ownerId: string;
}

/** La raíz `item` de la papelera del cliente `ownerId` que Soporte restaura (CA-11). */
export interface SupportRestoreCommand {
  readonly ownerId: string;
  readonly item: TrashItemRef;
}

/** Lo que pide el repositorio: además, la profundidad máxima del árbol (`FOLDER_MAX_DEPTH`, 006 CA-15). */
export interface SupportRestoreRequest extends SupportRestoreCommand {
  readonly maxDepth: number;
}

/**
 * Resultado de una restauración de Soporte, con lo que audita `node.restored`: cuántos nodos volvieron y sus bytes
 * (`tamano_bytes`, la versión actual: Soporte no lee `version_archivo`).
 */
export interface SupportRestoreResult extends RestoreResult {
  readonly itemCount: number;
  readonly sizeBytes: bigint;
}

/**
 * Papelera de un cliente vista por Soporte (plan 011b §2, ADR-0035). Lista solo raíces con retención vigente y
 * restaura con `restaurar_raiz_papelera`, que valida dueño, raíz, retención, destino y nombre: no hay `findRoot`
 * aparte. Corre en la transacción del llamador, como `SUPPORT`.
 */
export interface ISupportTrashRepository {
  /** Lanza `InvalidQueryError` si `cursor` no es uno emitido por la papelera. */
  listRoots(actor: Actor, query: SupportTrashQuery): Promise<TrashPage>;
  /**
   * Lanza `NodeNotFoundError` si `item` no es una raíz vigente del cliente (o es de otro) y `FolderDepthExceededError`
   * si la carpeta no cabe en su destino; en ambos casos nada cambia.
   */
  restoreRoot(actor: Actor, request: SupportRestoreRequest): Promise<SupportRestoreResult>;
}

export const I_SUPPORT_TRASH_REPOSITORY = Symbol('ISupportTrashRepository');
