import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import type { Plan } from '../domain/entities/plan.entity';
import type { Subscription } from '../domain/entities/subscription.entity';
import { PERSONAL_PLAN_SLUG } from '../domain/plan-slug';

import { InvoiceIssuer } from './invoice-issuer';
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
import { RenewalNotices } from './renewal-notices';
import { requirePlan } from './require-plan';
import { recordSubscriptionEvent } from './subscription-audit';

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
 * la fila bloqueada (un cobro por periodo, CA-3). En solo lectura nunca cobra: solo reenvía el correo de vencida (M-3).
 * Sin renovación automática o sin referencia del último pago, vence sin cobro; la bajada a Personal no cobra. Después del
 * commit emite la factura y los correos.
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
    @Inject(InvoiceIssuer) private readonly issuer: InvoiceIssuer,
    @Inject(RenewalNotices) private readonly notices: RenewalNotices,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async renew(actor: Actor): Promise<RenewalResult> {
    const settled = await this.transactions.withActor(actor, () => this.settle(actor));
    await this.afterCommit(actor, settled);
    return settled.result;
  }

  private async settle(actor: Actor): Promise<Settled> {
    const current = await this.subscriptions.lockCurrent(actor);
    if (current.isReadOnly) return { result: 'noticeResent', expired: current };
    if (!current.isDue(this.clock.now())) return { result: 'skipped' };
    const pending =
      current.pendingPlanId === null ? null : await requirePlan(this.plans, current.pendingPlanId);
    if (pending?.slug === PERSONAL_PLAN_SLUG) return this.downgrade(actor, current, pending);
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
  private async instrumentFor(actor: Actor, current: Subscription): Promise<string | null> {
    if (!current.autoRenew) return null;
    return (await this.payments.findLastApprovedCard(actor))?.instrumentRef ?? null;
  }

  /** CA-21: pasa a Personal sin cobro ni vencimiento; no se pierden archivos (la cuota se aplica en `storage`). */
  private async downgrade(actor: Actor, current: Subscription, personal: Plan): Promise<Settled> {
    await this.subscriptions.save(actor, current.renewWith(personal, this.clock.now()));
    await recordSubscriptionEvent(this.audit, actor, {
      action: AuditAction.SUBSCRIPTION_PLAN_CHANGE_APPLIED,
      attributes: { planSlug: personal.slug },
    });
    return { result: 'downgraded' };
  }

  private async afterCommit(actor: Actor, settled: Settled): Promise<void> {
    if (settled.result === 'renewed') {
      await this.afterRenewal(actor, settled.outcome, settled.previous);
    } else if ('expired' in settled) {
      const { expired } = settled;
      const plan = await requirePlan(this.plans, expired.planId);
      await this.notices.expired(actor, expired.expiresAt ?? this.clock.now(), plan.name);
    }
  }

  private async afterRenewal(actor: Actor, outcome: RenewalOutcome, previous: Date): Promise<void> {
    if (outcome.invoice !== null) await this.issuer.issueAfterCommit(actor, outcome.invoice.id);
    if (outcome.discardedPlan === null) return;
    await this.notices.discarded(actor, previous, {
      discarded: outcome.discardedPlan.name,
      renewed: outcome.plan.name,
      renewedUntil: outcome.subscription.expiresAt ?? previous,
    });
  }
}
