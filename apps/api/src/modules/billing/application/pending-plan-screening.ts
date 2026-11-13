import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';
import { PendingPlanRegistry } from '../../identity';

import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';

/**
 * Registro con plan: al verificarse la cuenta, conserva el plan elegido solo si se puede contratar (activo y de pago,
 * `Plan.isForSale`). Uno gratuito ya lo tiene la cuenta (Personal) y uno inexistente o dado de baja no se cobra: se
 * descarta. El navegador solo manda planes de pago, pero aquí no se confía en eso.
 */
@Injectable()
export class PendingPlanScreening {
  constructor(
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(PendingPlanRegistry) private readonly pendingPlans: PendingPlanRegistry,
  ) {}

  async screen(actor: Actor, pendingPlanSlug: string | null): Promise<void> {
    if (pendingPlanSlug === null) return;
    const plan = await this.plans.findBySlug(pendingPlanSlug);
    if (plan?.isForSale !== true) await this.pendingPlans.clear(actor);
  }
}
