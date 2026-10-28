import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../../shared';
import type { IPlanLimitsProvider, PlanLimits } from '../../../storage';
import { I_PLAN_REPOSITORY } from '../../application/ports/i-plan-repository.port';
import type { IPlanRepository } from '../../application/ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from '../../application/ports/i-subscription-repository.port';
import type {
  ISubscriptionRepository,
  SubscriptionStanding,
} from '../../application/ports/i-subscription-repository.port';
import { requirePlan, requirePlanBySlug } from '../../application/require-plan';
import type { Plan } from '../../domain/entities/plan.entity';
import { PERSONAL_PLAN_SLUG } from '../../domain/plan-slug';

/** Los límites de un plan, sin el estado de una cuenta (010 plan §2; ADR-0032 regla 5) ni su extra (011b). */
export type PlanStorageLimits = Omit<
  PlanLimits,
  'readOnly' | 'extraQuotaBytes' | 'extraQuotaUntil'
>;

type QuotaExtra = Pick<PlanLimits, 'extraQuotaBytes' | 'extraQuotaUntil'>;

const NO_EXTRA: QuotaExtra = { extraQuotaBytes: 0n, extraQuotaUntil: null };

/** 011b RN-1: el extra rige mientras `ahora < cuota_extra_hasta`; vencido se ve como `0` y `null`, sin job. */
const currentExtra = (standing: SubscriptionStanding, now: Date): QuotaExtra =>
  standing.extraQuotaUntil !== null && now < standing.extraQuotaUntil
    ? { extraQuotaBytes: standing.extraQuotaBytes, extraQuotaUntil: standing.extraQuotaUntil }
    : NO_EXTRA;

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
 * solo lectura conserva los límites de su plan (010 RN-5); `readOnly` sale de la misma lectura (ADR-0032). La cuota
 * suma el extra vigente según `IClock` (011b RN-1, CA-4).
 */
@Injectable()
export class PlanLimitsAdapter implements IPlanLimitsProvider {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async limitsFor(actor: Actor): Promise<PlanLimits> {
    const standing = await this.transactions.withActor(actor, () =>
      this.subscriptions.findStanding(actor),
    );
    if (standing === null) {
      return { ...(await this.getLimitsBySlug(PERSONAL_PLAN_SLUG)), readOnly: false, ...NO_EXTRA };
    }
    const plan = await this.getLimitsByPlanId(standing.planId);
    const extra = currentExtra(standing, this.clock.now());
    return {
      ...plan,
      storageQuotaBytes: plan.storageQuotaBytes + extra.extraQuotaBytes,
      readOnly: standing.readOnly,
      ...extra,
    };
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
