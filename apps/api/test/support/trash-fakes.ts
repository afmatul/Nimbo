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
} from '../../src/modules/storage/application/ports/i-trash.repository.port';
import { File } from '../../src/modules/storage/domain/file';
import { Folder } from '../../src/modules/storage/domain/folder';
import { FolderPath } from '../../src/modules/storage/domain/folder-path';
import { ObjectKey } from '../../src/modules/storage/domain/object-key';
import { TrashState } from '../../src/modules/storage/domain/trash-state';
import type { Actor } from '../../src/shared';

import type { FakeNodeRepository, Journal } from './storage-fakes';

type Node = File | Folder;

/** Raíz de la papelera de `actor` (lo que deja ver `ownedTrashedNodes`). */
const isTrashRootOf = (actor: Actor, node: Node | undefined): node is Node =>
  node !== undefined && node.ownerId === actor.id && node.trash?.isTrashRoot === true;

const carriedBy = (node: Node, folderId: string): boolean =>
  node.trash?.trashedWithFolderId === folderId;

const withTrash = <T extends Node>(node: T, trash: TrashState | null): T =>
  (node.type === 'file'
    ? File.rehydrate({ ...node.snapshot(), trash })
    : Folder.rehydrate({ ...node.snapshot(), trash })) as T;

/**
 * Papelera en memoria sobre los mapas de `FakeNodeRepository`: marca y restaura como el SQL de
 * `TypeOrmTrashRepository` (subárbol con `eliminado_con_carpeta_id`, solo lo arrastrado vuelve). No pagina.
 */
export class FakeTrashRepository implements ITrashRepository {
  /** Carpetas cuya carpeta original «se purgó» (R-5): se leen con `parentId: null` y la ruta guardada. */
  readonly orphans = new Set<string>();

  constructor(
    private readonly journal: Journal,
    private readonly nodes: FakeNodeRepository,
  ) {}

  markFileTrashed(_actor: Actor, fileId: string, state: TrashState): Promise<void> {
    this.journal.add('trash:markFileTrashed');
    const file = this.nodes.files.get(fileId);
    if (file !== undefined) this.nodes.files.set(fileId, withTrash(file, state));
    return Promise.resolve();
  }

  markFolderSubtreeTrashed(_actor: Actor, folder: Folder, state: TrashState): Promise<number> {
    this.journal.add('trash:markFolderSubtreeTrashed');
    const carried = state.carriedBy(folder.id);
    const folders = [...this.nodes.folders.values()].filter(
      (other) => other.trash === null && folder.path.contains(other.path) && other.id !== folder.id,
    );
    const folderIds = new Set([folder.id, ...folders.map((other) => other.id)]);
    const files = [...this.nodes.files.values()].filter(
      (file) => file.trash === null && file.folderId !== null && folderIds.has(file.folderId),
    );
    folders.forEach((other) => this.nodes.folders.set(other.id, withTrash(other, carried)));
    files.forEach((file) => this.nodes.files.set(file.id, withTrash(file, carried)));
    this.nodes.folders.set(folder.id, withTrash(folder, state));
    return Promise.resolve(1 + folders.length + files.length);
  }

  listTrash(actor: Actor, _query: TrashListQuery): Promise<TrashPage> {
    this.journal.add('trash:listTrash');
    return Promise.resolve({ items: this.entriesOf(actor), nextCursor: null });
  }

  trashSummary(actor: Actor): Promise<TrashTotals> {
    this.journal.add('trash:trashSummary');
    const entries = this.entriesOf(actor);
    const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0n);
    return Promise.resolve({ itemCount: entries.length, totalBytes });
  }

  findTrashedItem(actor: Actor, type: TrashItemType, id: string): Promise<TrashEntry | null> {
    this.journal.add('trash:findTrashedItem');
    const node = type === 'file' ? this.nodes.files.get(id) : this.nodes.folders.get(id);
    return Promise.resolve(isTrashRootOf(actor, node) ? this.entryOf(node) : null);
  }

  findTrashedFile(actor: Actor, id: string): Promise<File | null> {
    this.journal.add('trash:findTrashedFile');
    const file = this.nodes.files.get(id);
    return Promise.resolve(isTrashRootOf(actor, file) ? file : null);
  }

  findTrashedFolder(actor: Actor, id: string): Promise<TrashedFolder | null> {
    this.journal.add('trash:findTrashedFolder');
    const folder = this.nodes.folders.get(id);
    if (!isTrashRootOf(actor, folder)) return Promise.resolve(null);
    const carried = [...this.nodes.folders.values()].filter((other) => carriedBy(other, id));
    return Promise.resolve({
      id,
      ownerId: folder.ownerId,
      parentId: this.orphans.has(id) ? null : folder.parentId,
      name: folder.name,
      storedPath: folder.path,
      createdAt: folder.createdAt,
      deepestCarriedDepth: Math.max(folder.depth, ...carried.map((other) => other.depth)),
      sizeBytes: this.carriedBytes(id),
    });
  }

  restoreFile(_actor: Actor, restored: File): Promise<void> {
    this.journal.add('trash:restoreFile');
    this.nodes.files.set(restored.id, restored);
    return Promise.resolve();
  }

  restoreFolderSubtree(_actor: Actor, before: TrashedFolder, restored: Folder): Promise<number> {
    this.journal.add('trash:restoreFolderSubtree');
    const folders = [...this.nodes.folders.values()].filter((other) => carriedBy(other, before.id));
    const files = [...this.nodes.files.values()].filter((file) => carriedBy(file, before.id));
    folders.forEach((other) => this.nodes.folders.set(other.id, withTrash(other, null)));
    files.forEach((file) => this.nodes.files.set(file.id, withTrash(file, null)));
    this.rebase(before, restored);
    this.nodes.folders.set(restored.id, restored);
    return Promise.resolve(1 + folders.length + files.length);
  }

  purgeTargets(
    actor: Actor,
    item: TrashItemRef,
    dueBy: Date | null,
  ): Promise<readonly PurgeFile[] | null> {
    this.journal.add('trash:purgeTargets');
    const root =
      item.type === 'file' ? this.nodes.files.get(item.id) : this.nodes.folders.get(item.id);
    const due = dueBy === null || (root?.trash?.isExpired(dueBy) ?? false);
    if (!isTrashRootOf(actor, root) || !due) return Promise.resolve(null);
    const files =
      root.type === 'file'
        ? [root]
        : [...this.nodes.files.values()].filter((file) => carriedBy(file, root.id));
    return Promise.resolve(files.map((file) => this.purgeFileOf(file)));
  }

  deleteFileRows(_actor: Actor, fileId: string): Promise<void> {
    this.journal.add(`trash:deleteFileRows:${fileId}`);
    this.nodes.files.delete(fileId);
    return Promise.resolve();
  }

  deleteFolderRows(_actor: Actor, folderId: string): Promise<number> {
    this.journal.add(`trash:deleteFolderRows:${folderId}`);
    const files = [...this.nodes.files.values()].filter((file) => carriedBy(file, folderId));
    if (files.length > 0) return Promise.resolve(0);
    const folders = [...this.nodes.folders.values()].filter(
      (folder) => folder.id === folderId || carriedBy(folder, folderId),
    );
    folders.forEach((folder) => this.nodes.folders.delete(folder.id));
    return Promise.resolve(folders.length);
  }

  schedulePurgeOfAll(actor: Actor, at: Date): Promise<void> {
    this.journal.add('trash:schedulePurgeOfAll');
    for (const node of [...this.nodes.files.values(), ...this.nodes.folders.values()]) {
      if (!isTrashRootOf(actor, node) || node.trash === null || node.trash.isExpired(at)) continue;
      const trash = TrashState.rehydrate({ ...node.trash.snapshot(), purgeAt: at });
      if (node.type === 'file') this.nodes.files.set(node.id, withTrash(node, trash));
      else this.nodes.folders.set(node.id, withTrash(node, trash));
    }
    return Promise.resolve();
  }

  /** Clave de la versión actual (los dobles tienen una versión por archivo) y su tamaño. */
  private purgeFileOf(file: File): PurgeFile {
    const key = ObjectKey.of(file.ownerId, file.id, file.currentVersionId);
    return { id: file.id, sizeBytes: file.sizeBytes, objectKeys: [key.value] };
  }

  /** Como el `UPDATE` por prefijo: toda carpeta guardada bajo la ruta vieja, también la que sigue en la papelera. */
  private rebase(before: TrashedFolder, restored: Folder): void {
    if (before.storedPath.equals(restored.path)) return;
    const ancestors = restored.path.ancestorIds();
    const newParent = ancestors.length === 0 ? null : FolderPath.of(`/${ancestors.join('/')}/`);
    for (const other of [...this.nodes.folders.values()]) {
      if (other.id === before.id || !before.storedPath.contains(other.path)) continue;
      const path = other.path.rebase(before.storedPath, newParent);
      this.nodes.folders.set(other.id, Folder.rehydrate({ ...other.snapshot(), path }));
    }
  }

  private entriesOf(actor: Actor): TrashEntry[] {
    const roots = [...this.nodes.files.values(), ...this.nodes.folders.values()].filter((node) =>
      isTrashRootOf(actor, node),
    );
    return roots
      .map((node) => this.entryOf(node))
      .sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  }

  private entryOf(node: Node): TrashEntry {
    const parentId = node.type === 'file' ? node.folderId : node.parentId;
    const parent = parentId === null ? undefined : this.nodes.folders.get(parentId);
    const trash = node.trash as TrashState;
    return {
      id: node.id,
      type: node.type,
      name: node.name.value,
      kind: node.type === 'file' ? node.kind : null,
      sizeBytes: node.type === 'file' ? node.sizeBytes : this.carriedBytes(node.id),
      originalFolder: parent === undefined ? null : { id: parent.id, name: parent.name.value },
      deletedAt: trash.deletedAt,
      purgeAt: trash.purgeAt,
    };
  }

  private carriedBytes(folderId: string): bigint {
    return [...this.nodes.files.values()]
      .filter((file) => carriedBy(file, folderId))
      .reduce((sum, file) => sum + file.sizeBytes, 0n);
  }
}
