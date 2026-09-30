import type { IPlanLimitsProvider, PlanLimits } from '../../src/modules/storage';
import type { Actor } from '../../src/shared';

/**
 * Doble de `IPlanLimitsProvider` mientras 006a no lo implemente (R-3). Solo en `test/`: el código de producción
 * no tiene valores del catálogo de planes (RN-1). Devuelve los límites que la prueba le pasa.
 */
export class FakePlanLimitsProvider implements IPlanLimitsProvider {
  private limits: PlanLimits;
  private readonly requested: string[] = [];

  constructor(limits: PlanLimits) {
    this.limits = { ...limits };
  }

  get requestedFor(): readonly string[] {
    return [...this.requested];
  }

  setLimits(limits: PlanLimits): void {
    this.limits = { ...limits };
  }

  limitsFor(actor: Actor): Promise<PlanLimits> {
    this.requested.push(actor.id);
    return Promise.resolve({ ...this.limits });
  }
}
