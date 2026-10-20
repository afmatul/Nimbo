import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../../shared';
import type { Actor, ITransactionRunner } from '../../../../shared';
import type { IPlanLimitsProvider, PlanLimits } from '../../../storage';
import { I_PLAN_REPOSITORY } from '../../application/ports/i-plan-repository.port';
import type { IPlanRepository } from '../../application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from '../../application/ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from '../../application/ports/i-subscription-repository.port';
import { requirePlan, requirePlanBySlug } from '../../application/require-plan';
import type { Plan } from '../../domain/entities/plan.entity';
import { PERSONAL_PLAN_SLUG } from '../../domain/plan-slug';

/** Los límites de un plan, sin el estado de una cuenta (010 plan §2; ADR-0032 regla 5). */
export type PlanStorageLimits = Omit<PlanLimits, 'readOnly'>;

const toLimits = (plan: Plan): PlanStorageLimits => ({
  planName: plan.name,
  maxFileBytes: plan.limits.maxFileBytes,
  storageQuotaBytes: plan.limits.quotaBytes,
  trashRetentionDays: plan.limits.trashRetentionDays,
  retainedVersions: plan.limits.retainedVersions,
  maxEditors: plan.limits.maxEditors,
});

/**
 * Implementación de `IPlanLimitsProvider` (spec 006a, RN-4; 009 T-03, PD-80). `storage` declara el puerto; este
 * adaptador no importa entidades de `storage`. Los límites son los del plan de la `suscripcion` del actor, leída bajo
 * RLS con `withActor`; sin fila (cuenta sin verificar o interna), los de Personal y `readOnly` falso. Una cuenta en
 * solo lectura conserva los límites de su plan (010 RN-5); `readOnly` sale de la misma lectura (ADR-0032).
 */
@Injectable()
export class PlanLimitsAdapter implements IPlanLimitsProvider {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
  ) {}

  async limitsFor(actor: Actor): Promise<PlanLimits> {
    const standing = await this.transactions.withActor(actor, () =>
      this.subscriptions.findStanding(actor),
    );
    if (standing === null) {
      return { ...(await this.getLimitsBySlug(PERSONAL_PLAN_SLUG)), readOnly: false };
    }
    return { ...(await this.getLimitsByPlanId(standing.planId)), readOnly: standing.readOnly };
  }

  /** CA-2 y CA-4. No está en el puerto de `storage`: 005 fijó `limitsFor` como único método (ISP). */
  async getLimitsByPlanId(planId: string): Promise<PlanStorageLimits> {
    return toLimits(await requirePlan(this.plans, planId));
  }

  /** CA-3 y CA-4. Misma salvedad que `getLimitsByPlanId`. */
  async getLimitsBySlug(slug: string): Promise<PlanStorageLimits> {
    return toLimits(await requirePlanBySlug(this.plans, slug));
  }
}
