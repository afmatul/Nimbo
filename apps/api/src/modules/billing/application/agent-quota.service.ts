import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { agentUsagePeriod } from '../domain/agent-usage-period';
import type { AgentUsagePeriod } from '../domain/agent-usage-period';
import { PERSONAL_PLAN_SLUG } from '../domain/plan-slug';

import type {
  AgentQuotaReservation,
  AgentQuotaReserveResult,
  AgentQuotaStatus,
  IAgentQuota,
} from './ports/i-agent-quota.port';
import { I_AGENT_USAGE_REPOSITORY } from './ports/i-agent-usage.repository.port';
import type { IAgentUsageRepository } from './ports/i-agent-usage.repository.port';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { requirePlan, requirePlanBySlug } from './require-plan';

/** El periodo actual del actor y el límite de su plan. */
interface QuotaTerms {
  readonly period: AgentUsagePeriod;
  readonly limit: number;
}

/**
 * `IAgentQuota` (spec 020 D-3 y D-4; RF-34). Cada método corre en su propio `withActor`, así la reserva se confirma
 * antes de que el agente empiece a responder (CA-12). El límite es el del plan de la suscripción del actor, también en
 * solo lectura (CA-14); sin fila, el de Personal (RN-3).
 */
@Injectable()
export class AgentQuotaService implements IAgentQuota {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(I_AGENT_USAGE_REPOSITORY) private readonly usage: IAgentUsageRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /** CA-11 y CA-12: cuenta la consulta solo si queda alguna en el periodo. */
  reserve(actor: Actor): Promise<AgentQuotaReserveResult> {
    return this.transactions.withActor(actor, async () => {
      const { period, limit } = await this.currentTerms(actor);
      const periodStartsAt = period.startsAt;
      const used = await this.usage.reserveOne(actor, { periodStartsAt, limit });
      if (used === null) return { outcome: 'exhausted', limit, resetsAt: period.resetsAt };
      return {
        outcome: 'granted',
        reservation: { periodStartsAt },
        used,
        limit,
        resetsAt: period.resetsAt,
      };
    });
  }

  /** RN-5 y CA-15: devuelve la consulta a la fila que la reservó. */
  release(actor: Actor, reservation: AgentQuotaReservation): Promise<void> {
    return this.transactions.withActor(actor, () =>
      this.usage.releaseOne(actor, reservation.periodStartsAt),
    );
  }

  /** CA-10: usadas, total y renovación del periodo actual. */
  status(actor: Actor): Promise<AgentQuotaStatus> {
    return this.transactions.withActor(actor, async () => {
      const { period, limit } = await this.currentTerms(actor);
      const used = await this.usage.read(actor, period.startsAt);
      return { used, limit, resetsAt: period.resetsAt };
    });
  }

  private async currentTerms(actor: Actor): Promise<QuotaTerms> {
    const subscription = await this.subscriptions.findCurrent(actor);
    const plan =
      subscription === null
        ? await requirePlanBySlug(this.plans, PERSONAL_PLAN_SLUG)
        : await requirePlan(this.plans, subscription.planId);
    const period = agentUsagePeriod(subscription, this.clock.now());
    return { period, limit: plan.limits.agentQueriesPerMonth };
  }
}
