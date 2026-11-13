import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import type { Plan } from '../domain/entities/plan.entity';
import type { Subscription } from '../domain/entities/subscription.entity';
import { PlanChangeInvalidError } from '../domain/errors/plan-change-invalid.error';

import { BillingHistoryService } from './billing-history.service';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { planChangeEvents, recordSubscriptionEvent } from './subscription-audit';
import type { SubscriptionEvent } from './subscription-audit';
import type { SubscriptionSummary } from './subscription-summary';

/** El cambio de dominio sobre la fila bloqueada, los eventos que deja y lo que el caso de uso responde aparte. */
interface SettingsChange<T> {
  readonly next: Subscription;
  readonly events: readonly SubscriptionEvent[];
  readonly result: T;
}

/** El plan elegido y desde cuándo rige: la próxima fecha de cobro o, si se aplicó ya (CA-27), el periodo nuevo. */
export interface ScheduledPlanChange {
  readonly plan: Plan;
  readonly effectiveAt: Date;
}

/** Respuesta de programar un cambio: la vista nueva y el resultado que confirma la web. */
export interface PlanChangeOutcome {
  readonly summary: SubscriptionSummary | null;
  readonly change: ScheduledPlanChange;
}

/** Programado, rige al vencer el periodo pagado; aplicado ya (CA-27), desde el inicio del periodo nuevo. */
const effectiveAtOf = (next: Subscription): Date =>
  next.pendingPlanId === null || next.expiresAt === null ? next.startedAt : next.expiresAt;

/**
 * Ajustes de la suscripción del cliente (spec 010 CA-6, CA-16 a CA-19, CA-22, CA-27): renovación automática y cambio
 * de plan programado. Cada uno bloquea la fila dentro de `withActor`, aplica la regla de `Subscription`, guarda y audita
 * en la misma transacción, y responde la vista nueva (`BillingHistoryService.subscription`). Nada se cobra aquí.
 */
@Injectable()
export class SubscriptionSettingsService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(BillingHistoryService) private readonly views: BillingHistoryService,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /** CA-6: solo cambia la renovación automática; el periodo pagado sigue igual. */
  async setAutoRenew(actor: Actor, enabled: boolean): Promise<SubscriptionSummary | null> {
    const { summary } = await this.change(actor, (current) =>
      Promise.resolve({
        next: current.setAutoRenew(enabled),
        events: [{ action: AuditAction.SUBSCRIPTION_AUTO_RENEW_CHANGED, attributes: { enabled } }],
        result: undefined,
      }),
    );
    return summary;
  }

  /** CA-16 a CA-18 y CA-27: programa (o reemplaza) el plan del siguiente ciclo y dice desde cuándo rige. */
  async scheduleChange(actor: Actor, planSlug: string): Promise<PlanChangeOutcome> {
    const { summary, result } = await this.change(actor, async (current) => {
      const plan = await this.plans.findBySlug(planSlug);
      if (plan === null) throw new PlanChangeInvalidError();
      const next = current.scheduleChange(plan, this.clock.now());
      const scheduled = {
        action: AuditAction.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED,
        attributes: { planSlug: plan.slug },
      };
      return {
        next,
        events: [scheduled, ...planChangeEvents(current, next, plan)],
        result: { plan, effectiveAt: effectiveAtOf(next) },
      };
    });
    return { summary, change: result };
  }

  /** CA-19: quita el cambio programado; la renovación sigue con el plan actual. */
  async cancelChange(actor: Actor): Promise<SubscriptionSummary | null> {
    const { summary } = await this.change(actor, (current) =>
      Promise.resolve({
        next: current.cancelChange(),
        events: [{ action: AuditAction.SUBSCRIPTION_PLAN_CHANGE_CANCELLED }],
        result: undefined,
      }),
    );
    return summary;
  }

  private async change<T>(
    actor: Actor,
    decide: (current: Subscription) => Promise<SettingsChange<T>>,
  ): Promise<{ readonly summary: SubscriptionSummary | null; readonly result: T }> {
    const result = await this.transactions.withActor(actor, async () => {
      await this.subscriptions.insertPersonalIfAbsent(actor);
      const decided = await decide(await this.subscriptions.lockCurrent(actor));
      await this.subscriptions.save(actor, decided.next);
      for (const event of decided.events) await recordSubscriptionEvent(this.audit, actor, event);
      return decided.result;
    });
    return { summary: await this.views.subscription(actor), result };
  }
}
