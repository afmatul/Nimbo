/** Lo mínimo para decidir la retención: el número consecutivo de la versión (RN-4). */
export interface NumberedVersion {
  readonly number: number;
}

function assertRetained(retained: number): void {
  if (!Number.isInteger(retained) || retained < 1) {
    throw new TypeError('Las versiones retenidas deben ser un entero positivo.');
  }
}

/**
 * Retención de versiones por plan (RN-1, CA-13), pura. La cifra llega de `PlanLimits.retainedVersions` e incluye la
 * actual, que es siempre la de mayor número.
 */
export const VersionRetention = Object.freeze({
  /**
   * Las versiones que exceden `retained`, de la más antigua a la más reciente; nunca la actual. Para anticipar qué
   * podaría una versión nueva (CA-15), basta agregarla a `versions` antes de llamar.
   */
  surplus<T extends NumberedVersion>(versions: readonly T[], retained: number): readonly T[] {
    assertRetained(retained);
    const newestFirst = [...versions].sort((a, b) => b.number - a.number);
    return newestFirst.slice(retained).reverse();
  },
});
