import type { PlanLimitsAdapter } from '../modules/billing';
import type { IPlanLimitsProvider, PlanLimits } from '../modules/storage';

/** Planes de pago que el andamiaje puede forzar (`DEV_FORCE_PAID_PLAN`). */
export type DevPaidPlanSlug = 'pro' | 'equipo' | 'institucional';

/**
 * ANDAMIAJE TEMPORAL (016 RN-13, plan §2.1): todo actor recibe los límites del plan de pago `slug`, leídos de la
 * tabla `plan` (ningún número en código). Solo para la demo local hasta la 009; se borra al terminar la spec (T-11).
 */
export class DevPaidPlanLimitsProvider implements IPlanLimitsProvider {
  constructor(
    private readonly plans: Pick<PlanLimitsAdapter, 'getLimitsBySlug'>,
    private readonly slug: DevPaidPlanSlug,
  ) {}

  limitsFor(): Promise<PlanLimits> {
    return this.plans.getLimitsBySlug(this.slug);
  }
}
