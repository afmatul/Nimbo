import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import type { Subscription } from '../domain/entities/subscription.entity';
import type { InstrumentReference } from '../domain/payment-instrument';
import { PERSONAL_PLAN_SLUG } from '../domain/plan-slug';

import { resolveNextCycle } from './next-cycle';
import { I_INVOICE_REPOSITORY } from './ports/i-invoice-repository.port';
import type { IInvoiceRepository } from './ports/i-invoice-repository.port';
import { I_PAYMENT_REPOSITORY } from './ports/i-payment-repository.port';
import type { IPaymentRepository } from './ports/i-payment-repository.port';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { RenewalCheckout } from './renewal-checkout';
import type { RenewalOutcome } from './renewal-checkout';
import { RenewalFollowUp } from './renewal-follow-up';

/** Qué pasó con una cuenta en la pasada (los conteos de `billing.renewal_run`, CA-23). */
export type RenewalResult =
  'renewed' | 'rejected' | 'readOnly' | 'downgraded' | 'noticeResent' | 'skipped';

/** Lo decidido con la fila bloqueada; lo que sigue después del commit depende de esto. */
type Settled =
  | { readonly result: 'renewed'; readonly outcome: RenewalOutcome; readonly previous: Date }
  | { readonly result: 'rejected' | 'readOnly' | 'noticeResent'; readonly expired: Subscription }
  | { readonly result: 'downgraded' | 'skipped' };

/**
 * Renovación automática de una cuenta (spec 010 CA-1, CA-2, CA-7, CA-20, CA-21, CA-29; RN-2, RN-10), como su dueño y con
 * la fila bloqueada (un cobro por periodo, CA-3). En solo lectura nunca cobra: solo reenvía el correo de vencida (RN-10).
 * Sin renovación automática o sin referencia del último pago, vence sin cobro; la bajada a Personal no cobra. Decide; lo
 * que sigue al commit (factura y correos) es de `RenewalFollowUp`.
 */
@Injectable()
export class SubscriptionRenewer {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(I_PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(I_INVOICE_REPOSITORY) private readonly invoices: IInvoiceRepository,
    @Inject(RenewalCheckout) private readonly checkout: RenewalCheckout,
    @Inject(RenewalFollowUp) private readonly followUp: RenewalFollowUp,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async renew(actor: Actor): Promise<RenewalResult> {
    const settled = await this.transactions.withActor(actor, () => this.settle(actor));
    if (settled.result === 'renewed') {
      await this.followUp.renewed(actor, settled.outcome, settled.previous);
    } else if ('expired' in settled) {
      await this.followUp.expired(actor, settled.expired);
    }
    return settled.result;
  }

  private async settle(actor: Actor): Promise<Settled> {
    const current = await this.subscriptions.lockCurrent(actor);
    if (current.isReadOnly) return { result: 'noticeResent', expired: current };
    if (!current.isDue(this.clock.now())) return { result: 'skipped' };
    const { plan } = await resolveNextCycle(this.plans, current);
    if (plan.slug === PERSONAL_PLAN_SLUG) {
      await this.checkout.downgrade(actor, current, plan);
      return { result: 'downgraded' };
    }
    const instrument = await this.instrumentFor(actor, current);
    if (instrument === null) {
      return { result: 'readOnly', expired: await this.checkout.expire(actor, current) };
    }
    const nit = await this.invoices.findLatestNit(actor);
    const outcome = await this.checkout.renew(actor, current, {
      instrument,
      nit,
      trigger: 'scheduled',
    });
    if (outcome.payment.status === 'rechazada') {
      return { result: 'rejected', expired: outcome.subscription };
    }
    return { result: 'renewed', outcome, previous: current.expiresAt ?? this.clock.now() };
  }

  /** RN-2: la referencia del último pago aprobado, solo con la renovación automática encendida (RN-3, CA-7). */
  private async instrumentFor(
    actor: Actor,
    current: Subscription,
  ): Promise<InstrumentReference | null> {
    if (!current.autoRenew) return null;
    return (await this.payments.findLastApprovedCard(actor))?.instrumentRef ?? null;
  }
}
