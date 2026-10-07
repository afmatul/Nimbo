import { PlanDomain } from '../domain/plan-catalog';

export interface IPlanRepository {
  listAll(): Promise<PlanDomain[]>;
}

export const IPlanRepository = Symbol('IPlanRepository');
