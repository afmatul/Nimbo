import type { FolderRef, FolderSummary, NodeSummary } from '@nimbo/contracts';

import type { Folder } from '../domain/folder';
import type { StorageNode } from '../domain/storage-node';

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
