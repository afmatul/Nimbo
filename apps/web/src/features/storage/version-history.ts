import type { FileVersionSummary } from '@nimbo/contracts';

/**
 * Cuentas del historial de un archivo que la web necesita antes de restaurar (014 CA-6, CA-15, D-1). La lista llega de
 * la más nueva a la más antigua (`GET /files/:fileId/versions`).
 */

/**
 * Número de la versión que la poda eliminaría al registrar una nueva (CA-15): la más antigua retenida si el archivo ya
 * está en el límite del plan (D-2, cuenta la actual); `null` si queda lugar.
 */
export function versionToPrune(
  versions: readonly FileVersionSummary[],
  retainedVersions: number,
): number | null {
  if (versions.length < retainedVersions) return null;
  return versions.at(-1)?.number ?? null;
}

/** Espacio de las versiones que cuentan: el original conservado queda exento (014b CA-1). */
export function totalVersionBytes(versions: readonly FileVersionSummary[]): number {
  return versions.reduce(
    (sum, version) => sum + (version.keptUntil === null ? version.sizeBytes : 0),
    0,
  );
}

/** «3 versiones · tu plan Personal conserva 3, contando la actual»; sin el nombre del plan si aún no llegó. */
export function historySummary(
  count: number,
  retainedVersions: number,
  planName: string | null,
): string {
  const versions = count === 1 ? '1 versión' : `${String(count)} versiones`;
  const plan = planName === null ? 'tu plan' : `tu plan ${planName}`;
  return `${versions} · ${plan} conserva ${String(retainedVersions)}, contando la actual`;
}
