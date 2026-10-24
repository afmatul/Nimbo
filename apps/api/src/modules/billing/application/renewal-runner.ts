import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  attemptEach,
  createActor,
  I_TRANSACTION_RUNNER,
  IncompleteBatchError,
  Role,
} from '../../../shared';
import type { BatchFailure, ITransactionRunner } from '../../../shared';

import type { BillingLogger } from './billing-logger';
import { I_DUE_SUBSCRIPTION_SCANNER } from './ports/i-due-subscription.scanner.port';
import type { IDueSubscriptionScanner } from './ports/i-due-subscription.scanner.port';
import { RENEWAL_REMINDER_DAYS, RENEWAL_SCHEDULE_CONFIG } from './renewal-config';
import type { RenewalScheduleConfig } from './renewal-config';
import { RenewalReminderService } from './renewal-reminder.service';
import { SubscriptionRenewer } from './subscription-renewer';
import type { RenewalResult } from './subscription-renewer';

/** Quedaron cuentas sin procesar (CA-4): la pasada falla para que BullMQ la reintente. Sin ids ni datos de cuentas. */
export class RenewalRunIncompleteError extends IncompleteBatchError {
  constructor(failed: number) {
    super(
      failed,
      `La pasada de renovación dejó ${String(failed)} cuenta(s) sin procesar; se reintentará.`,
    );
  }
}

type RenewalCounts = Record<RenewalResult | 'reminded', number>;

const emptyCounts = (): RenewalCounts => ({
  renewed: 0,
  rejected: 0,
  readOnly: 0,
  downgraded: 0,
  noticeResent: 0,
  skipped: 0,
  reminded: 0,
});

const ownerOf = (userId: string) => createActor(userId, Role.CLIENT);

/**
 * Una pasada de la renovación (spec 010 CA-1 a CA-5, CA-23; plan §2): lista sin actor las cuentas vencidas y las por
 * avisar (`IDueSubscriptionScanner`), delega cada una como su dueño y un fallo no frena a las demás. La bitácora lleva
 * solo conteos y, por fallo, el nombre y el `code` del error (CA-23); si algo falló, la pasada falla al final (CA-4).
 */
@Injectable()
export class RenewalRunner {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_DUE_SUBSCRIPTION_SCANNER) private readonly scanner: IDueSubscriptionScanner,
    @Inject(SubscriptionRenewer) private readonly renewer: SubscriptionRenewer,
    @Inject(RenewalReminderService) private readonly reminders: RenewalReminderService,
    @Inject(RENEWAL_SCHEDULE_CONFIG) private readonly config: RenewalScheduleConfig,
    @Inject(RENEWAL_REMINDER_DAYS) private readonly reminderDays: number,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async runOnce(): Promise<void> {
    const counts = emptyCounts();
    const due = await this.transactions.run(() =>
      this.scanner.listDueForRenewal(this.config.batchSize),
    );
    let failed = await attemptEach(
      due,
      async (userId) => (counts[await this.renewer.renew(ownerOf(userId))] += 1),
      (_userId, failure) => this.logFailure(failure),
    );
    const toRemind = await this.transactions.run(() =>
      this.scanner.listDueForReminder(this.reminderDays, this.config.batchSize),
    );
    failed += await attemptEach(
      toRemind,
      async (userId) => (counts.reminded += (await this.reminders.remind(ownerOf(userId))) ? 1 : 0),
      (_userId, failure) => this.logFailure(failure),
    );
    this.logger.info({ event: 'billing.renewal_run', scanned: due.length, ...counts, failed });
    if (failed > 0) throw new RenewalRunIncompleteError(failed);
  }

  private logFailure(failure: BatchFailure): void {
    this.logger.error({ event: 'billing.renewal_failed', ...failure });
  }
}
