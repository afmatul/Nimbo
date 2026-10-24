import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { I_OBJECT_STORAGE } from '../../storage';
import type { IObjectStorage } from '../../storage';
import { InvoiceNotFoundError } from '../domain/errors/invoice-not-found.error';

import { I_BILLING_HISTORY_READER } from './ports/i-billing-history.reader.port';
import type {
  BillingHistoryRows,
  IBillingHistoryReader,
  PaymentMethod,
} from './ports/i-billing-history.reader.port';
import { I_PLAN_REPOSITORY } from './ports/i-plan-repository.port';
import type { IPlanRepository } from './ports/i-plan-repository.port';
import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';
import { RENEWAL_REMINDER_DAYS } from './renewal-config';
import { requirePlan } from './require-plan';
import { summarizeSubscription } from './subscription-summary';
import type { SubscriptionSummary } from './subscription-summary';

/** CA-8: el enlace de descarga de la factura vale 5 minutos (RNF-06). */
export const INVOICE_DOWNLOAD_TTL_SECONDS = 300;

/** Historial con la suscripción resumida (010 §6) para «Plan y facturación»; nula si aún no tiene fila. */
export interface BillingHistory extends BillingHistoryRows {
  readonly subscription: SubscriptionSummary | null;
}

export interface InvoiceDownload {
  readonly url: string;
  readonly expiresInSeconds: number;
}

/**
 * Historial y descarga de facturas del cliente (spec 009 CA-7, CA-8) y la vista de la suscripción (010 CA-25), que
 * también responden sus cambios. Todo se lee como el dueño, bajo RLS; una factura ajena, inexistente o sin PDF es el
 * mismo `InvoiceNotFoundError`.
 */
@Injectable()
export class BillingHistoryService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_BILLING_HISTORY_READER) private readonly reader: IBillingHistoryReader,
    @Inject(I_OBJECT_STORAGE) private readonly storage: IObjectStorage,
    @Inject(I_PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(RENEWAL_REMINDER_DAYS) private readonly reminderDays: number,
  ) {}

  history(actor: Actor): Promise<BillingHistory> {
    return this.transactions.withActor(actor, async () => {
      const rows = await this.reader.read(actor);
      return { ...rows, subscription: await this.summarize(actor, rows.paymentMethod) };
    });
  }

  /** 010 CA-6, CA-16, CA-19: la vista después de un cambio; `null` sin fila de suscripción. */
  subscription(actor: Actor): Promise<SubscriptionSummary | null> {
    return this.transactions.withActor(actor, async () =>
      this.summarize(actor, await this.reader.findPaymentMethod(actor)),
    );
  }

  async download(actor: Actor, invoiceId: string): Promise<InvoiceDownload> {
    const invoice = await this.transactions.withActor(actor, () =>
      this.reader.findDownloadable(actor, invoiceId),
    );
    if (invoice === null) throw new InvoiceNotFoundError();
    const url = await this.storage.presignDownload({
      key: invoice.objectKey,
      fileName: `factura-${invoice.number}.pdf`,
      expiresInSeconds: INVOICE_DOWNLOAD_TTL_SECONDS,
    });
    return { url, expiresInSeconds: INVOICE_DOWNLOAD_TTL_SECONDS };
  }

  private async summarize(
    actor: Actor,
    card: PaymentMethod | null,
  ): Promise<SubscriptionSummary | null> {
    const subscription = await this.subscriptions.findCurrent(actor);
    if (subscription === null) return null;
    const pendingPlan =
      subscription.pendingPlanId === null
        ? null
        : await requirePlan(this.plans, subscription.pendingPlanId);
    return summarizeSubscription(
      { subscription, plan: await requirePlan(this.plans, subscription.planId), pendingPlan, card },
      { now: this.clock.now(), reminderDays: this.reminderDays },
    );
  }
}
