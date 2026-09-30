/** Cómo se parte una carga por partes: cuántas y de qué tamaño (todas iguales salvo la última). */
export interface PartLayout {
  readonly totalParts: number;
  readonly partSizeBytes: bigint;
}

/** Reparte `declaredBytes` en partes de `partSizeBytes`; la última lleva el resto (función pura). */
export function planParts(declaredBytes: bigint, partSizeBytes: bigint): PartLayout {
  if (declaredBytes <= 0n || partSizeBytes <= 0n) {
    throw new RangeError('El tamaño declarado y el de parte deben ser mayores que 0.');
  }
  const totalParts = Number((declaredBytes + partSizeBytes - 1n) / partSizeBytes);
  return { totalParts, partSizeBytes };
}

/** Bytes que debe tener la parte `partNumber` (1…totalParts) de una carga de `declaredBytes`. */
export function expectedPartBytes(
  declaredBytes: bigint,
  layout: PartLayout,
  partNumber: number,
): bigint {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > layout.totalParts) {
    throw new RangeError('Número de parte fuera de rango.');
  }
  if (partNumber < layout.totalParts) return layout.partSizeBytes;
  return declaredBytes - BigInt(layout.totalParts - 1) * layout.partSizeBytes;
}
