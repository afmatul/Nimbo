import type { Actor } from '../../../../shared';
import type { File } from '../../domain/file';
import type { FileKind } from '../../domain/file-kind';
import type { Folder } from '../../domain/folder';
import type { FolderName } from '../../domain/folder-name.vo';
import type { FolderPath } from '../../domain/folder-path';
import type { StorageNode } from '../../domain/storage-node';
import type { TrashState } from '../../domain/trash-state';

/** Tipo de un elemento de la papelera (el mismo discriminante que `StorageNode`). */
export type TrashItemType = StorageNode['type'];

/**
 * Elemento propio de la papelera tal como se lista (CA-11, CA-12): una raíz del borrado. `sizeBytes` de una carpeta es
 * la suma de las versiones de lo que arrastró (RN-6); `originalFolder` es `null` en la raíz o si la carpeta se purgó.
 */
export interface TrashEntry {
  readonly id: string;
  readonly type: TrashItemType;
  readonly name: string;
  /** Solo en archivos. */
  readonly kind: FileKind | null;
  readonly sizeBytes: bigint;
  readonly originalFolder: { readonly id: string; readonly name: string } | null;
  readonly deletedAt: Date;
  readonly purgeAt: Date;
}

/** Página pedida de la papelera. `cursor` es el `nextCursor` opaco de la anterior. */
export interface TrashListQuery {
  readonly cursor?: string;
  readonly limit: number;
}

/** Página de la papelera: `eliminado_en DESC, id DESC`. `nextCursor` es `null` en la última. */
export interface TrashPage {
  readonly items: readonly TrashEntry[];
  readonly nextCursor: string | null;
}

/** Cuántos elementos tiene la papelera y cuánto ocupan sus versiones (CA-12). */
export interface TrashTotals {
  readonly itemCount: number;
  readonly totalBytes: bigint;
}

/**
 * Carpeta raíz de la papelera, leída **sin** `Folder.rehydrate`: si su carpeta original se purgó antes (R-5,
 * `ON DELETE SET NULL`), `parentId` es `null` pero `storedPath` conserva los ancestros. `storedPath` es el prefijo
 * guardado de su subárbol y sirve para reubicarlo.
 */
export interface TrashedFolder {
  readonly id: string;
  readonly ownerId: string;
  readonly parentId: string | null;
  readonly name: FolderName;
  readonly storedPath: FolderPath;
  readonly createdAt: Date;
  /** Profundidad guardada de la carpeta más honda que volvería con ella (la propia si no arrastró carpetas). */
  readonly deepestCarriedDepth: number;
  /** Suma de las versiones de los archivos que arrastró. */
  readonly sizeBytes: bigint;
}

/** Una raíz de la papelera por tipo e id (lo que se restaura o se purga). */
export interface TrashItemRef {
  readonly type: TrashItemType;
  readonly id: string;
}

/**
 * Un archivo que borra la purga (plan 006 §1): sus claves de objeto (una por versión; nunca salen de la API ni entran
 * en una bitácora) y la suma de sus versiones, que es lo que baja `espacio_usado`.
 */
export interface PurgeFile {
  readonly id: string;
  readonly sizeBytes: bigint;
  readonly objectKeys: readonly string[];
}

/**
 * Papelera del actor (plan 006 §2): marcar, listar, restaurar y purgar. Las raíces se resuelven con `ownedTrashedNodes(actor)`
 * dentro de la consulta y lo arrastrado por una carpeta se alcanza por `eliminado_con_carpeta_id` de una raíz propia;
 * todo método toma el `EntityManager` de `requireActorScope(actor)`. Como en `INodeRepository`, quien llama toma antes
 * `IQuotaRepository.lockUsage(actor)` en la misma transacción.
 */
export interface ITrashRepository {
  /** Manda a la papelera el archivo vivo `fileId` con `state` (CA-10). */
  markFileTrashed(actor: Actor, fileId: string, state: TrashState): Promise<void>;
  /**
   * Manda `folder` a la papelera con `state` y todo su subárbol vivo con la misma fecha y `eliminado_con_carpeta_id`
   * igual a `folder.id` (CA-11, RN-3). Lo eliminado antes por separado no se toca. Devuelve cuántos nodos marcó.
   */
  markFolderSubtreeTrashed(actor: Actor, folder: Folder, state: TrashState): Promise<number>;
  /** Lanza `InvalidQueryError` si `cursor` no es uno emitido por este repositorio. */
  listTrash(actor: Actor, query: TrashListQuery): Promise<TrashPage>;
  trashSummary(actor: Actor): Promise<TrashTotals>;
  /** El elemento propio de la papelera; `null` si no existe, es ajeno, fue arrastrado o se purgó (CA-16). */
  findTrashedItem(actor: Actor, type: TrashItemType, id: string): Promise<TrashEntry | null>;
  findTrashedFile(actor: Actor, id: string): Promise<File | null>;
  findTrashedFolder(actor: Actor, id: string): Promise<TrashedFolder | null>;
  /** Saca de la papelera el archivo con la carpeta y el nombre de `restored` (CA-13 a CA-15). */
  restoreFile(actor: Actor, restored: File): Promise<void>;
  /**
   * Saca de la papelera la carpeta y solo lo que arrastró (CA-13); si `restored` cambió de ruta, reubica la `ruta` y la
   * `profundidad` de todo el subárbol guardado bajo `before.storedPath`. Devuelve cuántos nodos volvieron.
   */
  restoreFolderSubtree(actor: Actor, before: TrashedFolder, restored: Folder): Promise<number>;
  /**
   * Archivos que borra la purga de `item`: el propio archivo o los que arrastró la carpeta. `null` si `item` no es una
   * raíz de la papelera del actor o, con `dueBy`, si su `purgar_en` es posterior (CA-16, CA-19). Una carpeta sin
   * archivos devuelve `[]`.
   */
  purgeTargets(
    actor: Actor,
    item: TrashItemRef,
    dueBy: Date | null,
  ): Promise<readonly PurgeFile[] | null>;
  /** Borra las filas de `version_archivo` y `archivo` de un archivo de la papelera. */
  deleteFileRows(actor: Actor, fileId: string): Promise<void>;
  /**
   * Borra la carpeta raíz `folderId` y las que arrastró, solo si ya no le quedan archivos arrastrados (CA-20).
   * Devuelve cuántas carpetas borró.
   */
  deleteFolderRows(actor: Actor, folderId: string): Promise<number>;
  /** «Vaciar papelera» (CA-18): adelanta `purgar_en` hasta `at` en todas las raíces de la papelera del actor. */
  schedulePurgeOfAll(actor: Actor, at: Date): Promise<void>;
}

export const I_TRASH_REPOSITORY = Symbol('ITrashRepository');
