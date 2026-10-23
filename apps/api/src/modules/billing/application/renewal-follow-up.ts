import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import type { Subscription } from '../domain/entities/subscription.entity';

import { InvoiceIssuer } from './invoice-issuer';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import type { RenewalOutcome } from './renewal-checkout';
import { RenewalNotices } from './renewal-notices';
import { requirePlan } from './require-plan';

/**
 * Lo que sigue al commit de la pasada (spec 010 CA-1, CA-2, CA-29), fuera de la transacción del cobro (SRP, separado de
 * `SubscriptionRenewer`, que decide): la factura PDF de una renovación, el correo del cambio descartado y el de vencida.
 */
@Injectable()
export class RenewalFollowUp {
  constructor(
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(InvoiceIssuer) private readonly issuer: InvoiceIssuer,
    @Inject(RenewalNotices) private readonly notices: RenewalNotices,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /** CA-1 y CA-29: `previous` es el `vence_en` del periodo renovado (clave del correo del descarte). */
  async renewed(actor: Actor, outcome: RenewalOutcome, previous: Date): Promise<void> {
    if (outcome.invoice !== null) await this.issuer.issueAfterCommit(actor, outcome.invoice.id);
    if (outcome.discardedPlan === null) return;
    await this.notices.discarded(actor, previous, {
      discarded: outcome.discardedPlan.name,
      renewed: outcome.plan.name,
      renewedUntil: outcome.subscription.expiresAt ?? previous,
    });
  }

  /** CA-2 y CA-7: el correo de vencida con el plan que conserva. */
  async expired(actor: Actor, expired: Subscription): Promise<void> {
    const plan = await requirePlan(this.plans, expired.planId);
    await this.notices.expired(actor, expired.expiresAt ?? this.clock.now(), plan.name);
  }
}
