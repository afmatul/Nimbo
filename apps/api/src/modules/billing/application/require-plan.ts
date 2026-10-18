import type { Plan } from '../domain/entities/plan.entity';
import { PlanNotFoundError } from '../domain/errors';

import type { IPlanRepository } from './ports/i-plan-repository.port';

/** El plan de una suscripción, activo o desactivado; si no existe, la fila está rota: `PlanNotFoundError` (006a CA-4). */
export const requirePlan = async (plans: IPlanRepository, planId: string): Promise<Plan> => {
  const plan = await plans.findById(planId);
  if (plan === null) throw new PlanNotFoundError(planId);
  return plan;
};
