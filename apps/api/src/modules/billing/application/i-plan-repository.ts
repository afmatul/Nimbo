import type { PlanSummary } from '../domain/plan-summary';

export const I_PLAN_REPOSITORY = Symbol('IPlanRepository');

export interface IPlanRepository {
  /** Rechaza con `PlanCatalogUnavailableError` si la lectura de `plan` falla (CA-3). */
  findAll(): Promise<PlanSummary[]>;
}
