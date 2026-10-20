import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { resolveNextCycle } from './next-cycle';
import { I_PAYMENT_REPOSITORY } from './ports/i-payment-repository.port';
import type { IPaymentRepository } from './ports/i-payment-repository.port';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import type { UpcomingCharge } from './renewal-messages';
import { RenewalNotices } from './renewal-notices';

/** El aviso de un periodo: su `vence_en` y lo que cobrará el siguiente ciclo. */
interface Reminder {
  readonly expiresAt: Date;
  readonly charge: UpcomingCharge;
}

/**
 * Aviso previo de una cuenta (spec 010 CA-5, RN-8), como su dueño: el plan y el monto del siguiente ciclo (RN-4, CA-29) y la
 * tarjeta que se cobrará, o el aviso de solo lectura si no se renovará sola. Un correo por periodo (clave y marca).
 */
@Injectable()
export class RenewalReminderService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(I_PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(RenewalNotices) private readonly notices: RenewalNotices,
  ) {}

  /** `true` si se envió el aviso; `false` si la cuenta ya no lo necesita (renovada, vencida o en Personal). */
  async remind(actor: Actor): Promise<boolean> {
    const reminder = await this.transactions.withActor(actor, () => this.reminderFor(actor));
    if (reminder === null) return false;
    await this.notices.reminder(actor, reminder.expiresAt, reminder.charge);
    return true;
  }

  private async reminderFor(actor: Actor): Promise<Reminder | null> {
    const current = await this.subscriptions.findCurrent(actor);
    if (current === null || current.isReadOnly || current.expiresAt === null) return null;
    const { plan: next } = await resolveNextCycle(this.plans, current);
    const card = current.autoRenew ? await this.payments.findLastApprovedCard(actor) : null;
    const chargeable = card !== null && card.instrumentRef !== null;
    return {
      expiresAt: current.expiresAt,
      charge: {
        planName: next.name,
        amountCents: next.priceCents,
        card: chargeable ? { brand: card.brand, last4: card.last4 } : null,
      },
    };
  }
}
