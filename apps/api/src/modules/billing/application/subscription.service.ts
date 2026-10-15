import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_RATE_LIMITER, I_TRANSACTION_RUNNER, RateLimitExceededError } from '../../../shared';
import type { Actor, IRateLimiter, ITransactionRunner, RateLimitRule } from '../../../shared';

import type { BillingLogger } from './billing-logger';
import { SubscriptionCheckout } from './subscription-checkout';
import type { SubscribeCommand, SubscribeOutcome } from './subscription-checkout';

const SUBSCRIBE_RATE_KEY_PREFIX = 'billing:subscribe:';
/** Decisión 6 de Adrián: 10 intentos por actor cada 15 minutos, más cerca del candado de login que de las cargas. */
const SUBSCRIBE_RATE_RULES: readonly RateLimitRule[] = [{ limit: 10, windowSeconds: 900 }];

/**
 * Contratación de un plan de pago (spec 009 CA-3 a CA-6, RN-8; plan §2): limita los intentos, corre los pasos de
 * `SubscriptionCheckout` en una sola transacción con `withActor` y registra el resultado después del commit. El `402`
 * de un rechazo lo lanza el controlador, también después del commit (B-3).
 */
@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(SubscriptionCheckout) private readonly checkout: SubscriptionCheckout,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async subscribe(actor: Actor, command: SubscribeCommand): Promise<SubscribeOutcome> {
    await this.assertRate(actor);
    const outcome = await this.transactions.withActor(actor, () =>
      this.checkout.checkout(actor, command),
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

  /** CA-5: el intento que supera el límite es 429 sin abrir la transacción ni cobrar. */
  private async assertRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(
      `${SUBSCRIBE_RATE_KEY_PREFIX}${actor.id}`,
      SUBSCRIBE_RATE_RULES,
    );
    if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
  }
}
