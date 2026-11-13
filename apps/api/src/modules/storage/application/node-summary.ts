import type { ExplorerNode, FolderRef, FolderSummary, NodeSummary } from '@nimbo/contracts';

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

/** Elemento de `GET /folders/contents`: el resumen más los distintivos del explorador. */
export function toExplorerNode(node: StorageNode, badges: ExplorerBadges): ExplorerNode {
  const shared = badges.shared.has(node.id);
  if (node.type === 'folder') return { type: 'folder', ...toFolderSummary(node), shared };
  const indexStatus = badges.indexStatus.get(node.id) ?? DEFAULT_INDEX_STATUS;
  return { type: 'file', ...toFileSummary(node), shared, indexStatus };
}
