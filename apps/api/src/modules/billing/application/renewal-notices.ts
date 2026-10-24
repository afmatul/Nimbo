import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { AccountContactReader } from '../../identity';
import { I_NOTIFIER } from '../../notifications';
import type { INotifier } from '../../notifications';

import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { expiredMessage, planDiscardedMessage, reminderMessage } from './renewal-messages';
import type { RenewalNotice, UpcomingCharge } from './renewal-messages';

/** CA-29: el plan descartado, el renovado y hasta cuándo. */
export interface DiscardedChange {
  readonly discarded: string;
  readonly renewed: string;
  readonly renewedUntil: Date;
}

/**
 * Correos de la renovación (spec 010 CA-2, CA-5, CA-7, CA-29) al correo del dueño, después del commit. La clave de cada
 * correo evita duplicados; el aviso previo y el de vencida se marcan en `suscripcion` (m-5) para que la pasada no los
 * vuelva a listar. Si encolar falla, lanza: la pasada cuenta el fallo y la reintenta (M-3).
 */
@Injectable()
export class RenewalNotices {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_NOTIFIER) private readonly notifier: INotifier,
    @Inject(AccountContactReader) private readonly contacts: AccountContactReader,
  ) {}

  async reminder(actor: Actor, expiresAt: Date, charge: UpcomingCharge): Promise<void> {
    await this.notifier.notify(reminderMessage(await this.noticeFor(actor, expiresAt), charge));
    await this.transactions.withActor(actor, () =>
      this.subscriptions.markReminderSent(actor, expiresAt),
    );
  }

  async expired(actor: Actor, expiresAt: Date, planName: string): Promise<void> {
    await this.notifier.notify(expiredMessage(await this.noticeFor(actor, expiresAt), planName));
    await this.transactions.withActor(actor, () =>
      this.subscriptions.markExpiredNoticeSent(actor, expiresAt),
    );
  }

  /** `expiresAt` es el `vence_en` del periodo que se renovó: la clave no cambia si la pasada se reintenta. */
  async discarded(actor: Actor, expiresAt: Date, change: DiscardedChange): Promise<void> {
    await this.notifier.notify(
      planDiscardedMessage(await this.noticeFor(actor, expiresAt), change),
    );
  }

  private async noticeFor(actor: Actor, expiresAt: Date): Promise<RenewalNotice> {
    const to = await this.transactions.withActor(actor, () => this.contacts.contactOf(actor));
    return { to, userId: actor.id, expiresAt };
  }
}
