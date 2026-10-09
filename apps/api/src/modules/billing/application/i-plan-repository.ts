import type { PlanDomain } from '../domain/plan-catalog';

export const I_PLAN_REPOSITORY = Symbol('IPlanRepository');

export interface IPlanRepository {
  findAll(): Promise<PlanDomain[]>;
}
