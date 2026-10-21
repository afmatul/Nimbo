import type { FileVersionSummary } from '@nimbo/contracts';

import type { VersionEntry } from '../domain/version-history';

/**
 * Una versión tal como la ve el cliente (plan 014 §4, CA-6): sin clave de objeto ni nombres de usuario. El tamaño va
 * como entero seguro (D-13 de 005); el cambio de tamaño, en texto, porque la resta de dos `bigint` puede salir de él.
 */
export function toFileVersionSummary(
  entry: VersionEntry,
  currentVersionId: string,
): FileVersionSummary {
  const { version, deltaBytes } = entry;
  return {
    id: version.id,
    number: version.number,
    origin: version.origin,
    sizeBytes: Number(version.sizeBytes),
    deltaBytes: deltaBytes === null ? null : deltaBytes.toString(),
    restoredFromNumber: version.restoredFromNumber,
    createdAt: version.createdAt.toISOString(),
    createdById: version.createdBy,
    isCurrent: version.id === currentVersionId,
  };
}
