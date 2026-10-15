import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  I_CLOCK,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  RateLimitExceededError,
} from '../../../shared';
import type {
  Actor,
  IClock,
  IRateLimiter,
  ITransactionRunner,
  RateLimitRule,
} from '../../../shared';
import { PlanNotAvailableError } from '../domain/errors/plan-not-available.error';
import type { PaymentCard } from '../domain/payment-card';
import type { Plan } from '../domain/plan.entity';
import type { Subscription } from '../domain/subscription.entity';
import { Money } from '../domain/value-objects/money';

import type { BillingLogger } from './billing-logger';
import { PaymentService } from './payment.service';
import type { ChargeResult } from './payment.service';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';

/** Qué contrata el cliente (CA-3): el plan por `slug` y la tarjeta ya validada contra RN-9. */
export interface SubscribeCommand {
  readonly planSlug: string;
  readonly card: PaymentCard;
}

/** Lo que quedó confirmado: el pago (aprobado o rechazado), el plan y la suscripción vigente. */
export interface SubscribeOutcome {
  readonly payment: ChargeResult;
  readonly plan: Plan;
  readonly subscription: Subscription;
}

const SUBSCRIBE_RATE_KEY_PREFIX = 'billing:subscribe:';
/** Decisión 6 de Adrián: 10 intentos por actor cada 15 minutos, más cerca del candado de login que de las cargas. */
const SUBSCRIBE_RATE_RULES: readonly RateLimitRule[] = [{ limit: 10, windowSeconds: 900 }];

/**
 * Contratación de un plan de pago (spec 009 CA-3 a CA-5, RN-8; plan §2). Una sola transacción con `withActor`:
 * garantiza la fila Personal (sin ella `FOR UPDATE` no bloquea nada), la bloquea, valida el plan, cobra con
 * `PaymentService` y, solo si se aprueba, mueve la suscripción. Un rechazo se confirma como fila y se devuelve; el
 * `402` lo lanza el controlador después del commit (B-3).
 */
@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async subscribe(actor: Actor, command: SubscribeCommand): Promise<SubscribeOutcome> {
    await this.assertRate(actor);
    const outcome = await this.transactions.withActor(actor, () =>
      this.chargeLocked(actor, command),
    );
    this.logger.info({
      event:
        outcome.payment.status === 'aprobada'
          ? 'billing.payment_approved'
          : 'billing.payment_rejected',
      paymentId: outcome.payment.id,
      planId: outcome.plan.id,
    });
    return outcome;
  }

  private async chargeLocked(actor: Actor, command: SubscribeCommand): Promise<SubscribeOutcome> {
    await this.subscriptions.insertPersonalIfAbsent(actor);
    const current = await this.subscriptions.lockCurrent(actor);
    const plan = await this.plans.findBySlug(command.planSlug);
    if (plan === null) throw new PlanNotAvailableError();
    const next = current.subscribeTo(plan, this.clock.now());
    const payment = await this.payments.charge(actor, {
      planId: plan.id,
      amount: Money.ofCents(plan.priceCents),
      card: command.card,
    });
    if (payment.status === 'rechazada') return { payment, plan, subscription: current };
    await this.subscriptions.save(actor, next);
    return { payment, plan, subscription: next };
  }

  /** CA-5: el intento que supera el límite es 429 sin abrir la transacción ni cobrar. */
  private async assertRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(
      `${SUBSCRIBE_RATE_KEY_PREFIX}${actor.id}`,
      SUBSCRIBE_RATE_RULES,
    );
    if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
  }
}
