import { Inject, Injectable } from '@nestjs/common';
import type { AuditTrigger } from '@nimbo/contracts';

import { I_CLOCK } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import type { Invoice } from '../domain/entities/invoice.entity';
import type { Plan } from '../domain/entities/plan.entity';
import type { Subscription } from '../domain/entities/subscription.entity';
import type { PaymentInstrument } from '../domain/payment-instrument';
import { Money } from '../domain/value-objects/money';

import { InvoiceService } from './invoice.service';
import { resolveNextCycle } from './next-cycle';
import type { NextCyclePlan } from './next-cycle';
import { PaymentService } from './payment.service';
import type { ChargeResult } from './payment.service';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { planChangeEvents, recordSubscriptionEvent } from './subscription-audit';
import type { SubscriptionAuditAttributes } from './subscription-audit';

/**
 * Quién pidió la renovación (atributo `trigger` de la auditoría, 010 plan §2): el cliente (`manual`) o la pasada
 * programada (`scheduled`), el mismo vocabulario que «Mi actividad» muestra como «Nimbo (automático)».
 */
export type RenewalTrigger = AuditTrigger;

/** Con qué se renueva: la tarjeta presente (manual) o la referencia del último pago (automática), y el NIT. */
export interface RenewalOrder {
  readonly instrument: PaymentInstrument;
  readonly nit: string;
  readonly trigger: RenewalTrigger;
}

/** Lo que quedó confirmado; `discardedPlan` es el plan programado que se desactivó (CA-29), para avisar al cliente. */
export interface RenewalOutcome {
  readonly payment: ChargeResult;
  readonly plan: Plan;
  readonly subscription: Subscription;
  readonly invoice: Invoice | null;
  readonly discardedPlan: Plan | null;
}

/** El plan del siguiente ciclo y la suscripción de la que parte (sin el cambio, si se descartó). */
interface NextCycle extends NextCyclePlan {
  readonly from: Subscription;
}

/** Lo que audita una renovación aprobada: la fila antes y después, el ciclo y quién la pidió. */
interface RenewalAudit {
  readonly before: Subscription;
  readonly next: Subscription;
  readonly cycle: NextCycle;
  readonly trigger: RenewalTrigger;
}

/**
 * Pasos de la renovación dentro de la transacción del cobro, con la fila ya bloqueada (spec 010 plan §2; RN-1, RN-4,
 * CA-20, CA-29): resuelve el plan del siguiente ciclo, cobra su precio completo y, si se aprueba, renueva, registra la
 * factura y audita. Un rechazo se devuelve sin lanzar (como en la 009): a mano no cambia nada (CA-9); en la automática la
 * cuenta queda en solo lectura (CA-2). Comparte con
 * `SubscriptionCheckout` los colaboradores, no la secuencia (plan §2). También aplica la bajada a Personal al vencer.
 */
@Injectable()
export class RenewalCheckout {
  constructor(
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async renew(actor: Actor, current: Subscription, order: RenewalOrder): Promise<RenewalOutcome> {
    const cycle = await this.nextCycle(current);
    const payment = await this.payments.charge(actor, {
      planId: cycle.plan.id,
      amount: Money.ofCents(cycle.plan.priceCents),
      instrument: order.instrument,
    });
    if (payment.status === 'rechazada')
      return this.rejected(actor, current, { payment, cycle, order });
    const next = cycle.from.renewWith(cycle.plan, this.clock.now());
    await this.subscriptions.save(actor, next);
    const invoice = await this.invoices.register(actor, payment, order.nit);
    await this.auditRenewal(actor, { before: current, next, cycle, trigger: order.trigger });
    return {
      payment,
      plan: cycle.plan,
      subscription: next,
      invoice,
      discardedPlan: cycle.discardedPlan,
    };
  }

  /**
   * CA-2, CA-7 (RN-5): vence sin pago y queda en solo lectura con su plan; un cambio programado sigue programado
   * (CA-20). Lo usa también la pasada cuando no hay renovación automática o no hay con qué cobrar.
   */
  async expire(actor: Actor, current: Subscription): Promise<Subscription> {
    const expired = current.expire();
    await this.subscriptions.save(actor, expired);
    await this.record(actor, AuditAction.SUBSCRIPTION_READ_ONLY_ENTERED, {});
    return expired;
  }

  private async rejected(
    actor: Actor,
    current: Subscription,
    attempt: {
      readonly payment: ChargeResult;
      readonly cycle: NextCycle;
      readonly order: RenewalOrder;
    },
  ): Promise<RenewalOutcome> {
    const { payment, cycle, order } = attempt;
    await this.record(actor, AuditAction.SUBSCRIPTION_RENEWAL_REJECTED, {
      trigger: order.trigger,
      planSlug: cycle.plan.slug,
    });
    const subscription =
      order.trigger === 'scheduled' ? await this.expire(actor, current) : current;
    return { payment, plan: cycle.plan, subscription, invoice: null, discardedPlan: null };
  }

  /** CA-21: al vencer con Personal programado, pasa a Personal sin cobro ni vencimiento (la cuota la aplica `storage`). */
  async downgrade(actor: Actor, current: Subscription, personal: Plan): Promise<Subscription> {
    const next = current.renewWith(personal, this.clock.now());
    await this.subscriptions.save(actor, next);
    for (const event of planChangeEvents(current, next, personal)) {
      await recordSubscriptionEvent(this.audit, actor, event);
    }
    return next;
  }

  /** RN-4 y CA-29 (`resolveNextCycle`); si el programado se descartó, la renovación parte de la fila sin el cambio. */
  private async nextCycle(current: Subscription): Promise<NextCycle> {
    const cycle = await resolveNextCycle(this.plans, current);
    return { ...cycle, from: cycle.discardedPlan === null ? current : current.cancelChange() };
  }

  /** CA-6, CA-22 (plan §2): renovada, cambio aplicado, salida de solo lectura y cambio descartado; nunca datos de tarjeta. */
  private async auditRenewal(actor: Actor, renewal: RenewalAudit): Promise<void> {
    const { before, next, cycle, trigger } = renewal;
    await this.record(actor, AuditAction.SUBSCRIPTION_RENEWED, {
      trigger,
      planSlug: cycle.plan.slug,
      amountCents: cycle.plan.priceCents,
    });
    for (const event of planChangeEvents(before, next, cycle.plan)) {
      await recordSubscriptionEvent(this.audit, actor, event);
    }
    if (cycle.discardedPlan !== null) {
      await this.record(actor, AuditAction.SUBSCRIPTION_PLAN_CHANGE_DISCARDED, {
        planSlug: cycle.discardedPlan.slug,
      });
    }
  }

  private record(
    actor: Actor,
    action: AuditAction,
    attributes: SubscriptionAuditAttributes,
  ): Promise<void> {
    return recordSubscriptionEvent(this.audit, actor, { action, attributes });
  }
}
