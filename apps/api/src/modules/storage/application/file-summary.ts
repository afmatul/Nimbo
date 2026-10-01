import type { FileSummary } from '@nimbo/contracts';

import type { File } from '../domain/file';

/** Archivo tal como lo ve el cliente: sin clave de objeto ni ids de versión. Tamaño en JSON como entero seguro (D-13). */
export function toFileSummary(file: File): FileSummary {
  return {
    id: file.id,
    name: file.name.value,
    sizeBytes: Number(file.sizeBytes),
    kind: file.kind,
    folderId: file.folderId,
    createdAt: file.createdAt.toISOString(),
  };
}
