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

export interface FileTooLargeDecision {
  readonly ok: false;
  readonly violation: 'FileTooLarge';
  readonly sizeBytes: bigint;
  readonly maxBytes: bigint;
}

export interface QuotaExceededDecision {
  readonly ok: false;
  readonly violation: 'QuotaExceeded';
  readonly missingBytes: bigint;
}

export type QuotaDecision = { readonly ok: true } | FileTooLargeDecision | QuotaExceededDecision;

const ALLOWED = Object.freeze({ ok: true as const });

/**
 * Decide si cabe un archivo (funciones puras). Primero el máximo por archivo (CA-3) y después la cuota: lo usado
 * más lo reservado más lo declarado no puede pasar de la cuota (CA-4, CA-23). Restaurar una versión (014 RN-9) mira
 * solo la cuota.
 */
export const QuotaPolicy = Object.freeze({
  check(limits: QuotaLimits, usage: QuotaUsage, declaredBytes: bigint): QuotaDecision {
    const size = QuotaPolicy.checkFileSize(limits, declaredBytes);
    return size.ok ? QuotaPolicy.checkQuota(limits, usage, declaredBytes) : size;
  },

  /** Solo el máximo por archivo del plan (CA-3). */
  checkFileSize(
    limits: Pick<QuotaLimits, 'maxFileBytes'>,
    sizeBytes: bigint,
  ): typeof ALLOWED | FileTooLargeDecision {
    if (sizeBytes <= limits.maxFileBytes) return ALLOWED;
    return { ok: false, violation: 'FileTooLarge', sizeBytes, maxBytes: limits.maxFileBytes };
  },

  /** Solo la cuota: usado + reservado + `bytes` no pasa de ella (CA-4, CA-23). */
  checkQuota(
    limits: Pick<QuotaLimits, 'storageQuotaBytes'>,
    usage: QuotaUsage,
    bytes: bigint,
  ): typeof ALLOWED | QuotaExceededDecision {
    const missingBytes = usage.usedBytes + usage.reservedBytes + bytes - limits.storageQuotaBytes;
    return missingBytes > 0n ? { ok: false, violation: 'QuotaExceeded', missingBytes } : ALLOWED;
  },

  /** Lo que aún cabe (spec 007 CA-1, D-5): cuota menos usado y reservado, la base de `check`; nunca negativo. */
  available(limits: QuotaLimits, usage: QuotaUsage): bigint {
    const free = limits.storageQuotaBytes - usage.usedBytes - usage.reservedBytes;
    return free > 0n ? free : 0n;
  },
});
