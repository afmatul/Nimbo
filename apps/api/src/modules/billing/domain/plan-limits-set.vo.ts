/**
 * Límites de un plan (M4; spec 011). Se llama `PlanLimitsSet` porque `PlanLimits` ya es el tipo de `storage` con los
 * límites que necesita la carga. Bytes en `bigint` (ADR-0016).
 */
export interface PlanLimitsSet {
  readonly quotaBytes: bigint;
  readonly maxFileBytes: bigint;
  readonly maxEditors: number;
  readonly agentQueriesPerMonth: number;
  readonly retainedVersions: number;
  readonly trashRetentionDays: number;
}
