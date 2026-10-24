import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { logPaymentOutcome } from './billing-logger';
import type { BillingLogger } from './billing-logger';
import { InvoiceIssuer } from './invoice-issuer';
import { PaymentAttemptLimiter } from './payment-attempt-limiter';
import { SubscriptionCheckout } from './subscription-checkout';
import type { SubscribeCommand, SubscribeOutcome } from './subscription-checkout';
/**
 * Contratación de un plan de pago (spec 009 CA-3 a CA-6, RN-8; plan §2): limita los intentos, corre los pasos de
 * `SubscriptionCheckout` en una sola transacción con `withActor`, registra el resultado y, después del commit, emite el
 * PDF de la factura (T-07). Si la emisión falla, el pago ya está confirmado (RN-8) y `invoice-retry` la repone. El `402`
 * de un rechazo lo lanza el controlador, también después del commit (B-3).
 */
@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(SubscriptionCheckout) private readonly checkout: SubscriptionCheckout,
    @Inject(PaymentAttemptLimiter) private readonly attempts: PaymentAttemptLimiter,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
    @Inject(InvoiceIssuer) private readonly issuer: InvoiceIssuer,
  ) {}

  async subscribe(actor: Actor, command: SubscribeCommand): Promise<SubscribeOutcome> {
    await this.attempts.assertAllowed(actor);
    const outcome = await this.transactions.withActor(actor, () =>
      this.checkout.checkout(actor, command),
    );
    logPaymentOutcome(this.logger, outcome.payment, outcome.plan.id);
    if (outcome.invoice !== null) await this.issuer.issueAfterCommit(actor, outcome.invoice.id);
    return outcome;
  }
}
