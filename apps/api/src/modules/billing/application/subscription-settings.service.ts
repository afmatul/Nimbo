import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
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

/** Un evento de auditoría que acompaña al cambio (CA-6, CA-22). */
/** El cambio de dominio sobre la fila bloqueada y los eventos que deja. */
interface SettingsChange {
  readonly next: Subscription;
  readonly events: readonly SubscriptionEvent[];
}

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
  setAutoRenew(actor: Actor, enabled: boolean): Promise<SubscriptionSummary | null> {
    return this.change(actor, (current) =>
      Promise.resolve({
        next: current.setAutoRenew(enabled),
        events: [{ action: AuditAction.SUBSCRIPTION_AUTO_RENEW_CHANGED, attributes: { enabled } }],
      }),
    );
  }

  /** CA-16 a CA-18 y CA-27: programa (o reemplaza) el plan del siguiente ciclo. */
  scheduleChange(actor: Actor, planSlug: string): Promise<SubscriptionSummary | null> {
    return this.change(actor, async (current) => {
      const plan = await this.plans.findBySlug(planSlug);
      if (plan === null) throw new PlanChangeInvalidError();
      const next = current.scheduleChange(plan, this.clock.now());
      const scheduled = {
        action: AuditAction.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED,
        attributes: { planSlug: plan.slug },
      };
      return { next, events: [scheduled, ...planChangeEvents(current, next, plan)] };
    });
  }

  /** CA-19: quita el cambio programado; la renovación sigue con el plan actual. */
  cancelChange(actor: Actor): Promise<SubscriptionSummary | null> {
    return this.change(actor, (current) =>
      Promise.resolve({
        next: current.cancelChange(),
        events: [{ action: AuditAction.SUBSCRIPTION_PLAN_CHANGE_CANCELLED }],
      }),
    );
  }

  private async change(
    actor: Actor,
    decide: (current: Subscription) => Promise<SettingsChange>,
  ): Promise<SubscriptionSummary | null> {
    await this.transactions.withActor(actor, async () => {
      await this.subscriptions.insertPersonalIfAbsent(actor);
      const { next, events } = await decide(await this.subscriptions.lockCurrent(actor));
      await this.subscriptions.save(actor, next);
      for (const event of events) await recordSubscriptionEvent(this.audit, actor, event);
    });
    return this.views.subscription(actor);
  }
}
