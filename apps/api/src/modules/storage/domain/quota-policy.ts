/** Límites de almacenamiento del plan del actor, en bytes. Llegan como argumento (RN-1): ningún valor vive aquí. */
export interface QuotaLimits {
  readonly maxFileBytes: bigint;
  readonly storageQuotaBytes: bigint;
}

/** Espacio del actor: el ya usado (`usuario.espacio_usado`) y el reservado por cargas activas no vencidas. */
export interface QuotaUsage {
  readonly usedBytes: bigint;
  readonly reservedBytes: bigint;
}

export type QuotaDecision =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly violation: 'FileTooLarge';
      readonly sizeBytes: bigint;
      readonly maxBytes: bigint;
    }
  | { readonly ok: false; readonly violation: 'QuotaExceeded'; readonly missingBytes: bigint };

const ALLOWED: QuotaDecision = Object.freeze({ ok: true });

/**
 * Decide si cabe un archivo (función pura). Primero el máximo por archivo (CA-3) y después la cuota: lo usado
 * más lo reservado más lo declarado no puede pasar de la cuota (CA-4, CA-23).
 */
export const QuotaPolicy = Object.freeze({
  check(limits: QuotaLimits, usage: QuotaUsage, declaredBytes: bigint): QuotaDecision {
    if (declaredBytes > limits.maxFileBytes) {
      return {
        ok: false,
        violation: 'FileTooLarge',
        sizeBytes: declaredBytes,
        maxBytes: limits.maxFileBytes,
      };
    }
    const missingBytes =
      usage.usedBytes + usage.reservedBytes + declaredBytes - limits.storageQuotaBytes;
    return missingBytes > 0n ? { ok: false, violation: 'QuotaExceeded', missingBytes } : ALLOWED;
  },
});
