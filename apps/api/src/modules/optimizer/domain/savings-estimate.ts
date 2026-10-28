/** Umbral de RN-2: se exigen **los dos** mínimos (`OPTIMIZER_MIN_SAVED_BYTES` y `OPTIMIZER_MIN_SAVED_PERCENT`). */
export interface SavingsThreshold {
  readonly minBytes: bigint;
  readonly minPercent: number;
}

const PERCENT = 100n;

/**
 * Ahorro de recomprimir una versión (M7, `SavingsEstimate`; plan 021 §2): el tamaño de origen y el del resultado, los
 * dos positivos. Conviene solo si el resultado es menor y ahorra a la vez el mínimo de bytes y el de porcentaje (RN-2);
 * el porcentaje se compara en enteros (`ahorro × 100 ≥ mínimo × original`), sin redondear.
 */
export class SavingsEstimate {
  constructor(
    readonly originalBytes: bigint,
    readonly resultBytes: bigint,
  ) {
    if (originalBytes <= 0n || resultBytes <= 0n) {
      throw new TypeError('Los tamaños de una estimación de ahorro son positivos.');
    }
    Object.freeze(this);
  }

  /** Bytes que se ahorrarían; cero o negativo si el resultado no es menor. */
  get savedBytes(): bigint {
    return this.originalBytes - this.resultBytes;
  }

  isWorthIt({ minBytes, minPercent }: SavingsThreshold): boolean {
    const saved = this.savedBytes;
    return (
      saved > 0n && saved >= minBytes && saved * PERCENT >= BigInt(minPercent) * this.originalBytes
    );
  }
}
