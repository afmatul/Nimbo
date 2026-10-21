import type { Plan } from '../domain/entities/plan.entity';
import { PlanNotFoundError } from '../domain/errors';

import type { IPlanRepository } from './ports/i-plan-repository.port';

/** El plan de una suscripción, activo o desactivado; si no existe, la fila está rota: `PlanNotFoundError` (006a CA-4). */
export const requirePlan = async (plans: IPlanRepository, planId: string): Promise<Plan> => {
  const plan = await plans.findById(planId);
  if (plan === null) throw new PlanNotFoundError();
  return plan;
};

/** Lo mismo por `slug` (006a CA-3): un plan que debe existir, como Personal. */
export const requirePlanBySlug = async (plans: IPlanRepository, slug: string): Promise<Plan> => {
  const plan = await plans.findBySlug(slug);
  if (plan === null) throw new PlanNotFoundError();
  return plan;
};
