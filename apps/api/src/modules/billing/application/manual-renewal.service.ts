import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import type { Subscription } from '../domain/entities/subscription.entity';
import { AlreadyRenewedError } from '../domain/errors/already-renewed.error';
import { PlanChangePendingError } from '../domain/errors/plan-change-pending.error';
import type { PaymentCard } from '../domain/payment-card';

import { logPaymentOutcome } from './billing-logger';
import type { BillingLogger } from './billing-logger';
import { InvoiceIssuer } from './invoice-issuer';
import { PaymentAttemptLimiter } from './payment-attempt-limiter';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { RenewalCheckout } from './renewal-checkout';
import type { RenewalOutcome } from './renewal-checkout';

/** Lo que paga el cliente (CA-8): la tarjeta ya validada contra RN-9, el NIT y el `vence_en` que vio (RN-9 de la 010). */
export interface ManualRenewalCommand {
  readonly card: PaymentCard;
  readonly nit: string;
  readonly expectedExpiresAt: Date;
}

/**
 * CA-11 (Personal), CA-26 (ya renovado) y CA-28 (cambio programado) con la regla de `renewalQuote`, la misma de la vista;
 * y RN-9: si el `vence_en` cambió desde que el cliente lo vio, otro cobro ya renovó.
 */
const assertRenewable = (current: Subscription, expectedExpiresAt: Date, now: Date): void => {
  const quote = current.renewalQuote(now);
  if (quote.unavailableReason === 'PLAN_CHANGE_PENDING') throw new PlanChangePendingError();
  if (!quote.available || current.expiresAt?.getTime() !== expectedExpiresAt.getTime()) {
    throw new AlreadyRenewedError();
  }
};

/**
 * `POST /billing/renew` (spec 010 CA-8 a CA-11, CA-26, CA-28; plan §2): el mismo límite de intentos que contratar, la
 * fila bloqueada dentro de `withActor` (un cobro por periodo, RN-9), `RenewalCheckout` con la tarjeta presente y, después
 * del commit, la bitácora y la emisión del comprobante. El `402` lo lanza el controlador (009 B-3).
 */
@Injectable()
export class ManualRenewalService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(RenewalCheckout) private readonly checkout: RenewalCheckout,
    @Inject(PaymentAttemptLimiter) private readonly attempts: PaymentAttemptLimiter,
    @Inject(InvoiceIssuer) private readonly issuer: InvoiceIssuer,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async renew(actor: Actor, command: ManualRenewalCommand): Promise<RenewalOutcome> {
    await this.attempts.assertAllowed(actor);
    const outcome = await this.transactions.withActor(actor, () =>
      this.renewLocked(actor, command),
    );
    logPaymentOutcome(this.logger, outcome.payment, outcome.plan.id);
    if (outcome.invoice !== null) await this.issuer.issueAfterCommit(actor, outcome.invoice.id);
    return outcome;
  }

  private async renewLocked(actor: Actor, command: ManualRenewalCommand): Promise<RenewalOutcome> {
    await this.subscriptions.insertPersonalIfAbsent(actor);
    const current = await this.subscriptions.lockCurrent(actor);
    assertRenewable(current, command.expectedExpiresAt, this.clock.now());
    return this.checkout.renew(actor, current, {
      instrument: command.card,
      nit: command.nit,
      trigger: 'manual',
    });
  }
}
