/**
 * Tipos PROVISIONALES del resumen de espacio (spec 007 T-08), con la forma de `SpaceSummaryResponse` de
 * `GET /storage/summary`. T-10 los reemplaza por los de `@nimbo/contracts` (T-01): este es el único archivo que cambia.
 * Bytes como enteros seguros de JavaScript (RN-3).
 */
export interface SpaceBreakdown {
  readonly documentsBytes: number;
  readonly imagesBytes: number;
  readonly otherBytes: number;
  readonly trashBytes: number;
}

export interface SpaceSummaryResponse {
  readonly usedBytes: number;
  /** Cargas en curso (005 RN-13); restan del disponible, no del porcentaje (plan D-5). */
  readonly reservedBytes: number;
  readonly quotaBytes: number;
  readonly availableBytes: number;
  readonly maxFileBytes: number;
  readonly trashRetentionDays: number;
  readonly breakdown: SpaceBreakdown;
}
