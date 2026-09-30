import type { Actor } from '../../../../shared';
import type { File } from '../../domain/file';
import type { FileName } from '../../domain/file-name.vo';
import type { FileVersion } from '../../domain/file-version';

/** Página pedida de la raíz del actor. `cursor` es el `nextCursor` opaco de la página anterior. */
export interface FileListQuery {
  readonly cursor?: string;
  readonly limit: number;
}

/** Página de archivos: raíz, sin papelera, `creado_en DESC, id DESC`. `nextCursor` es `null` en la última. */
export interface FileListPage {
  readonly items: readonly File[];
  readonly nextCursor: string | null;
}

/**
 * Nodos del actor (diagrama M2; en 005 solo archivos). Toda consulta une `accessibleNodes(actor)` de `access` y toma
 * el `EntityManager` de `TransactionContext.requireActorScope(actor)` (ADR-0005): no hay método sin actor.
 */
export interface INodeRepository {
  /** El archivo si el actor tiene acceso y no está en la papelera; `null` en otro caso (CA-16: ajeno = inexistente). */
  findAccessibleById(actor: Actor, id: string): Promise<File | null>;
  /** Lanza `InvalidQueryError` si `cursor` no es uno emitido por este repositorio. */
  listAccessible(actor: Actor, query: FileListQuery): Promise<FileListPage>;
  /**
   * Nombres ocupados en la raíz del actor que chocan con `name` o con sus copias «base (n).ext», tal como están
   * guardados; la comparación no distingue mayúsculas e ignora la papelera (CA-6). Alimenta `FileName.firstFree`.
   */
  findTakenNames(actor: Actor, name: FileName): Promise<readonly string[]>;
  /** Inserta el archivo y su versión actual en la transacción del actor (la FK `version_actual_id` es diferida). */
  insertWithVersion(actor: Actor, file: File, version: FileVersion): Promise<void>;
}

export const I_NODE_REPOSITORY = Symbol('INodeRepository');
