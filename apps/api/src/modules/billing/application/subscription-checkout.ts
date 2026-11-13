import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import { PendingPlanRegistry } from '../../identity';
import type { Invoice } from '../domain/entities/invoice.entity';
import type { Plan } from '../domain/entities/plan.entity';
import type { Subscription } from '../domain/entities/subscription.entity';
import { PlanNotAvailableError } from '../domain/errors/plan-not-available.error';
import type { PaymentCard } from '../domain/payment-card';
import { Money } from '../domain/value-objects/money';

import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import type { ChargeResult } from './payment.service';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';

/** Qué contrata el cliente (CA-3): el plan por `slug`, la tarjeta ya validada contra RN-9 y el NIT de la factura. */
export interface SubscribeCommand {
  readonly planSlug: string;
  readonly card: PaymentCard;
  readonly nit: string;
}

/** Lo que quedó confirmado: el pago (aprobado o rechazado), el plan, la suscripción vigente y la factura (si se aprobó). */
export interface SubscribeOutcome {
  readonly payment: ChargeResult;
  readonly plan: Plan;
  readonly subscription: Subscription;
  readonly invoice: Invoice | null;
}

/**
 * Los pasos de negocio del cobro (spec 009 CA-3 a CA-6, plan §2), dentro de la transacción que abre
 * `SubscriptionService`: garantiza la fila Personal (sin ella `FOR UPDATE` no bloquea nada), la bloquea, valida el
 * plan, cobra y, solo si se aprueba, mueve la suscripción, registra la factura y descarta el plan elegido al
 * registrarse (ya contratado o reemplazado por este). Un rechazo se devuelve sin lanzar (B-3).
 */
@Injectable()
export class SubscriptionCheckout {
  constructor(
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PendingPlanRegistry) private readonly pendingPlans: PendingPlanRegistry,
  ) {}

  async checkout(actor: Actor, command: SubscribeCommand): Promise<SubscribeOutcome> {
    await this.subscriptions.insertPersonalIfAbsent(actor);
    const current = await this.subscriptions.lockCurrent(actor);
    const plan = await this.plans.findBySlug(command.planSlug);
    if (plan === null) throw new PlanNotAvailableError();
    const next = current.subscribeTo(plan, this.clock.now());
    const payment = await this.payments.charge(actor, {
      planId: plan.id,
      amount: Money.ofCents(plan.priceCents),
      instrument: command.card,
    });
    if (payment.status === 'rechazada') {
      return { payment, plan, subscription: current, invoice: null };
    }
    await this.subscriptions.save(actor, next);
    const invoice = await this.invoices.register(actor, payment, command.nit);
    await this.pendingPlans.clear(actor);
    return { payment, plan, subscription: next, invoice };
  }
}
