import type { Actor } from '../../../../shared';
import type { File } from '../../domain/file';
import type { FileName } from '../../domain/file-name.vo';
import type { FileVersion } from '../../domain/file-version';
import type { Folder } from '../../domain/folder';
import type { FolderName } from '../../domain/folder-name.vo';
import type { NodeOrder } from '../../domain/node-order';
import type { StorageNode } from '../../domain/storage-node';

/**
 * Página pedida de una carpeta (`folderId: null` = raíz) en el orden `order`. `cursor` es el `nextCursor` opaco de la
 * anterior, emitido con el mismo orden.
 */
export interface NodeListQuery {
  readonly folderId: string | null;
  readonly order: NodeOrder;
  readonly cursor?: string;
  readonly limit: number;
}

/** Contenido directo de una carpeta: carpetas primero y luego archivos, cada grupo en su clave de `order` (007 D-7). */
export interface NodeListPage {
  readonly items: readonly StorageNode[];
  readonly nextCursor: string | null;
}

/**
 * Árbol vivo del actor (diagrama M2): archivos y carpetas fuera de la papelera. Toda consulta une
 * `accessibleNodes(actor)` de `access` y toma el `EntityManager` de `TransactionContext.requireActorScope(actor)`
 * (ADR-0005): no hay método sin actor. Las mutaciones no se serializan aquí: quien las llama toma antes
 * `IQuotaRepository.lockUsage(actor)` en la misma transacción (plan 006 §1).
 */
export interface INodeRepository {
  /** El archivo si el actor tiene acceso y no está en la papelera; `null` en otro caso (CA-16: ajeno = inexistente). */
  findAccessibleById(actor: Actor, id: string): Promise<File | null>;
  /** La carpeta si el actor tiene acceso y no está en la papelera; `null` en otro caso (CA-5). */
  findAccessibleFolder(actor: Actor, id: string): Promise<Folder | null>;
  /** Subcarpetas y archivos directos de una carpeta o de la raíz (CA-5). Lanza `InvalidQueryError` si el cursor no es válido o es de otro orden. */
  listContents(actor: Actor, query: NodeListQuery): Promise<NodeListPage>;
  /** Ancestros de `folder`, desde la raíz y sin ella (migas, CA-5). */
  breadcrumbs(actor: Actor, folder: Folder): Promise<readonly Folder[]>;
  /**
   * Nombres de archivo ocupados en la carpeta `folderId` (`null` = raíz) que chocan con `name` o con sus copias
   * «base (n).ext», tal como están guardados; sin distinguir mayúsculas e ignorando la papelera (005 CA-6) y el archivo
   * `exceptId` (renombrar o mover en el mismo lugar). Alimenta `FileName.firstFree`.
   */
  findTakenNames(
    actor: Actor,
    name: FileName,
    folderId: string | null,
    exceptId?: string,
  ): Promise<readonly string[]>;
  /** Como `findTakenNames`, pero entre las carpetas hijas de `parentId` y con copias «base (n)» (CA-3, CA-14). */
  findTakenFolderNames(
    actor: Actor,
    name: FolderName,
    parentId: string | null,
    exceptId?: string,
  ): Promise<readonly string[]>;
  /** Profundidad de la carpeta viva más honda del subárbol de `folder` (la propia si no tiene hijas; CA-9). */
  maxSubtreeDepth(actor: Actor, folder: Folder): Promise<number>;
  /** Inserta el archivo y su versión actual en la transacción del actor (la FK `version_actual_id` es diferida). */
  insertWithVersion(actor: Actor, file: File, version: FileVersion): Promise<void>;
  insertFolder(actor: Actor, folder: Folder): Promise<void>;
  /** Guarda el nombre y `actualizado_en` de `folder`. */
  renameFolder(actor: Actor, folder: Folder): Promise<void>;
  /** Guarda el nombre y `actualizado_en` de `file`. */
  renameFile(actor: Actor, file: File): Promise<void>;
  /** Guarda la carpeta, el nombre (quizá «(n)») y `actualizado_en` de `file` (CA-7). */
  moveFile(actor: Actor, file: File): Promise<void>;
  /**
   * Lleva `before` a la posición de `moved` (padre y ruta) y reubica la `ruta` y la `profundidad` de todo su subárbol,
   * también lo eliminado aparte, en un `UPDATE` por prefijo (CA-7).
   */
  moveFolderSubtree(actor: Actor, before: Folder, moved: Folder): Promise<void>;
}

export const I_NODE_REPOSITORY = Symbol('INodeRepository');
