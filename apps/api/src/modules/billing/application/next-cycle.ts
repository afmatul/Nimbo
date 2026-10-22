import type { Plan } from '../domain/entities/plan.entity';
import type { Subscription } from '../domain/entities/subscription.entity';

import type { IPlanRepository } from './ports/i-plan-repository.port';
import { requirePlan } from './require-plan';

/** El plan que cobra el siguiente ciclo y, si había uno programado que se desactivó, ese plan descartado (CA-29). */
export interface NextCyclePlan {
  readonly plan: Plan;
  readonly discardedPlan: Plan | null;
}

/**
 * RN-4 y CA-29, la única regla del plan del siguiente ciclo: el programado si sigue activo; si se desactivó, se
 * descarta y sigue el actual. La usan la renovación, la pasada, el aviso previo y la vista (mismo monto en todos).
 */
export const chooseNextCycle = (current: Plan, pending: Plan | null): NextCyclePlan => {
  if (pending === null) return { plan: current, discardedPlan: null };
  return pending.isActive
    ? { plan: pending, discardedPlan: null }
    : { plan: current, discardedPlan: pending };
};

/** `chooseNextCycle` leyendo los planes de la suscripción. */
export const resolveNextCycle = async (
  plans: IPlanRepository,
  subscription: Subscription,
): Promise<NextCyclePlan> => {
  const pending =
    subscription.pendingPlanId === null
      ? null
      : await requirePlan(plans, subscription.pendingPlanId);
  return chooseNextCycle(await requirePlan(plans, subscription.planId), pending);
};
