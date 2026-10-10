import type { PlanSummary } from '../domain/plan-summary';

export const I_PLAN_REPOSITORY = Symbol('IPlanRepository');

export interface IPlanRepository {
  findAll(): Promise<PlanSummary[]>;
}
