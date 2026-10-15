/** Lectura de un plan del catálogo público (spec 008): dinero en centavos enteros y bytes en `bigint` (ADR-0016). */
export interface PlanSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceCents: number;
  readonly quotaBytes: bigint;
  readonly maxFileBytes: bigint;
  readonly maxEditors: number;
  readonly agentQueriesPerMonth: number;
  readonly retainedVersions: number;
  readonly trashRetentionDays: number;
}
