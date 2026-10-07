import type { TrashItem } from '@nimbo/contracts';

import type { TrashEntry } from './ports/i-trash.repository.port';

/** Elemento de la papelera tal como lo ve el cliente (plan 006 §4). Tamaño en JSON como entero seguro (D-13). */
export function toTrashItem(entry: TrashEntry): TrashItem {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    ...(entry.kind === null ? {} : { kind: entry.kind }),
    sizeBytes: Number(entry.sizeBytes),
    originalFolder: entry.originalFolder,
    deletedAt: entry.deletedAt.toISOString(),
    purgeAt: entry.purgeAt.toISOString(),
  };
}
