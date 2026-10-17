import type { FileVersion } from './file-version';

/**
 * Una fila del historial (CA-6), de solo lectura: la versión y su cambio de tamaño frente a la anterior retenida;
 * `null` si no la hay (la primera, o la más antigua retenida cuya anterior ya se podó).
 */
export interface VersionEntry {
  readonly version: FileVersion;
  readonly deltaBytes: bigint | null;
}

function entryOf(version: FileVersion, previous: FileVersion | undefined): VersionEntry {
  const deltaBytes = previous === undefined ? null : version.sizeBytes - previous.sizeBytes;
  return Object.freeze({ version, deltaBytes });
}

/** Historial de un archivo (RF-29), puro: de la versión más reciente a la más antigua por número. */
export const VersionHistory = Object.freeze({
  of(versions: readonly FileVersion[]): readonly VersionEntry[] {
    const newestFirst = [...versions].sort((a, b) => b.number - a.number);
    return Object.freeze(
      newestFirst.map((version, index) => entryOf(version, newestFirst[index + 1])),
    );
  },
});
