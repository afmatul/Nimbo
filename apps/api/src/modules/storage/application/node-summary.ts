import type {
  ExplorerFile,
  ExplorerFolder,
  ExplorerNode,
  FolderRef,
  FolderSummary,
  NodeSummary,
} from '@nimbo/contracts';

import type { File } from '../domain/file';
import type { Folder } from '../domain/folder';
import type { StorageNode } from '../domain/storage-node';

import type { ExplorerBadges } from './explorer-badge.service';
import { toFileSummary } from './file-summary';

/** Referencia mínima a una carpeta (migas, carpeta abierta). */
export function toFolderRef(folder: Folder): FolderRef {
  return { id: folder.id, name: folder.name.value };
}

/** Carpeta tal como la ve el cliente: sin ruta ni profundidad (detalles de persistencia). */
export function toFolderSummary(folder: Folder): FolderSummary {
  return {
    id: folder.id,
    name: folder.name.value,
    parentId: folder.parentId,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

/** Elemento del explorador, discriminado por `type`. */
export function toNodeSummary(node: StorageNode): NodeSummary {
  return node.type === 'folder'
    ? { type: 'folder', ...toFolderSummary(node) }
    : { type: 'file', ...toFileSummary(node) };
}

/** Sin fila de indexación todavía, el archivo indexable está en cola (019 RN-12: la conciliación la crea). */
const DEFAULT_INDEX_STATUS = 'pending';

/** Carpeta del explorador: el listado y las respuestas de crear, renombrar y mover. */
export function toExplorerFolder(folder: Folder, badges: ExplorerBadges): ExplorerFolder {
  return { type: 'folder', ...toFolderSummary(folder), shared: badges.shared.has(folder.id) };
}

/** Archivo del explorador: el listado y las respuestas de renombrar y mover. */
export function toExplorerFile(file: File, badges: ExplorerBadges): ExplorerFile {
  const indexStatus = badges.indexStatus.get(file.id) ?? DEFAULT_INDEX_STATUS;
  return { type: 'file', ...toFileSummary(file), shared: badges.shared.has(file.id), indexStatus };
}

/** Elemento de `GET /folders/contents`: el resumen más los distintivos del explorador. */
export function toExplorerNode(node: StorageNode, badges: ExplorerBadges): ExplorerNode {
  return node.type === 'folder' ? toExplorerFolder(node, badges) : toExplorerFile(node, badges);
}
