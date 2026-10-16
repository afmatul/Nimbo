import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../../shared';
import type { Actor, ITransactionRunner } from '../../../../shared';
import type { IPlanLimitsProvider, PlanLimits } from '../../../storage';
import { I_PLAN_REPOSITORY } from '../../application/ports/i-plan-repository.port';
import type { IPlanRepository } from '../../application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from '../../application/ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from '../../application/ports/i-subscription-repository.port';
import { PlanNotFoundError } from '../../domain/errors';
import { PERSONAL_PLAN_SLUG } from '../../domain/plan-slug';
import type { Plan } from '../../domain/plan.entity';

const toLimits = (plan: Plan): PlanLimits => ({
  planName: plan.name,
  maxFileBytes: plan.limits.maxFileBytes,
  storageQuotaBytes: plan.limits.quotaBytes,
  trashRetentionDays: plan.limits.trashRetentionDays,
});

/**
 * Implementación de `IPlanLimitsProvider` (spec 006a, RN-4; 009 T-03, PD-80). `storage` declara el puerto; este
 * adaptador no importa entidades de `storage`. Los límites son los del plan de la `suscripcion` del actor, leída bajo
 * RLS con `withActor`; sin fila (cuenta sin verificar o interna), los de Personal. Ignora `vence_en` hasta la 010.
 */
@Injectable()
export class PlanLimitsAdapter implements IPlanLimitsProvider {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
  ) {}

  async limitsFor(actor: Actor): Promise<PlanLimits> {
    const planId = await this.transactions.withActor(actor, () =>
      this.subscriptions.findCurrentPlanId(actor),
    );
    return planId === null
      ? this.getLimitsBySlug(PERSONAL_PLAN_SLUG)
      : this.getLimitsByPlanId(planId);
  }

  /** CA-2 y CA-4. No está en el puerto de `storage`: 005 fijó `limitsFor` como único método (ISP). */
  async getLimitsByPlanId(planId: string): Promise<PlanLimits> {
    const plan = await this.plans.findById(planId);
    if (plan === null) throw new PlanNotFoundError(planId);
    return toLimits(plan);
  }

  /** CA-3 y CA-4. Misma salvedad que `getLimitsByPlanId`. */
  async getLimitsBySlug(slug: string): Promise<PlanLimits> {
    const plan = await this.plans.findBySlug(slug);
    if (plan === null) throw new PlanNotFoundError(slug);
    return toLimits(plan);
  }
}
