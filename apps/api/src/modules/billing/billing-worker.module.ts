import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { z } from 'zod';

import type { workerEnvSchema } from '../../shared';
import { AuditModule } from '../audit';
import { IdentityReadersModule } from '../identity';
import { NotificationsWorkerModule } from '../notifications';

import { InvoiceIssuer } from './application/invoice-issuer';
import { InvoiceRetrier } from './application/invoice-retrier';
import { INVOICE_RETRY_CONFIG } from './application/invoice-retry-config';
import type { InvoiceRetryConfig } from './application/invoice-retry-config';
import { I_DUE_SUBSCRIPTION_SCANNER } from './application/ports/i-due-subscription.scanner.port';
import { I_INVOICE_GENERATOR } from './application/ports/i-invoice-generator.port';
import { I_PENDING_INVOICE_SCANNER } from './application/ports/i-pending-invoice.scanner.port';
import { RENEWAL_REMINDER_DAYS, RENEWAL_SCHEDULE_CONFIG } from './application/renewal-config';
import type { RenewalScheduleConfig } from './application/renewal-config';
import { RenewalFollowUp } from './application/renewal-follow-up';
import { RenewalNotices } from './application/renewal-notices';
import { RenewalReminderService } from './application/renewal-reminder.service';
import { RenewalRunner } from './application/renewal-runner';
import { SUBSCRIPTION_RECONCILE_CONFIG } from './application/subscription-reconcile-config';
import type { SubscriptionReconcileConfig } from './application/subscription-reconcile-config';
import { SubscriptionReconcilerService } from './application/subscription-reconciler.service';
import { SubscriptionRenewer } from './application/subscription-renewer';
import { BillingChargingModule } from './billing-charging.module';
import { BillingModule } from './billing.module';
import { PdfInvoiceGenerator } from './infrastructure/adapters/pdf-invoice-generator';
import { InvoiceRetryProcessor } from './infrastructure/invoice-retry.processor';
import {
  INVOICE_RETRY_QUEUE,
  InvoiceRetryScheduler,
} from './infrastructure/invoice-retry.scheduler';
import { SqlDueSubscriptionScanner } from './infrastructure/persistence/sql-due-subscription.scanner';
import { SqlPendingInvoiceScanner } from './infrastructure/persistence/sql-pending-invoice.scanner';
import { RenewalProcessor } from './infrastructure/renewal.processor';
import { RenewalScheduler, SUBSCRIPTION_RENEWAL_QUEUE } from './infrastructure/renewal.scheduler';
import { SubscriptionReconcileProcessor } from './infrastructure/subscription-reconcile.processor';
import {
  SUBSCRIPTION_RECONCILE_QUEUE,
  SubscriptionReconcileScheduler,
} from './infrastructure/subscription-reconcile.scheduler';

/** Variables del `worker` que `billing` usa (plan 009 §2). */
export type BillingWorkerEnv = Pick<
  z.infer<typeof workerEnvSchema>,
  | 'SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES'
  | 'SUBSCRIPTION_RECONCILE_BATCH_SIZE'
  | 'INVOICE_RETRY_INTERVAL_MINUTES'
  | 'INVOICE_RETRY_BATCH_SIZE'
  | 'SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES'
  | 'SUBSCRIPTION_RENEWAL_BATCH_SIZE'
  | 'RENEWAL_REMINDER_DAYS'
>;

/** La pasada de la 010 (plan §2): renovación automática, vencimiento y aviso previo. */
const RENEWAL_PROVIDERS = [
  { provide: I_DUE_SUBSCRIPTION_SCANNER, useClass: SqlDueSubscriptionScanner },
  RenewalNotices,
  RenewalFollowUp,
  SubscriptionRenewer,
  RenewalReminderService,
  RenewalRunner,
  RenewalScheduler,
  RenewalProcessor,
];

/** Las configuraciones de las tres pasadas de `billing`, armadas desde el entorno del `worker`. */
const configProviders = (env: BillingWorkerEnv) => [
  {
    provide: SUBSCRIPTION_RECONCILE_CONFIG,
    useValue: {
      intervalMinutes: env.SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES,
      batchSize: env.SUBSCRIPTION_RECONCILE_BATCH_SIZE,
    } satisfies SubscriptionReconcileConfig,
  },
  {
    provide: INVOICE_RETRY_CONFIG,
    useValue: {
      intervalMinutes: env.INVOICE_RETRY_INTERVAL_MINUTES,
      batchSize: env.INVOICE_RETRY_BATCH_SIZE,
    } satisfies InvoiceRetryConfig,
  },
  {
    provide: RENEWAL_SCHEDULE_CONFIG,
    useValue: {
      intervalMinutes: env.SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES,
      batchSize: env.SUBSCRIPTION_RENEWAL_BATCH_SIZE,
    } satisfies RenewalScheduleConfig,
  },
  { provide: RENEWAL_REMINDER_DAYS, useValue: env.RENEWAL_REMINDER_DAYS },
];

/**
 * Parte de `billing` que corre en el `worker` (specs 009 y 010): las colas `subscription-reconcile` (CA-2),
 * `invoice-retry` (CA-6) y `subscription-renewal` (010), sus programas repetibles y sus procesadores; el cobro de la
 * renovación automática viene de `BillingChargingModule`. El alta Personal viene de `BillingModule`, la lista de clientes
 * verificados de `IdentityReadersModule` y la subida del PDF de la **misma** instancia de `StorageWorkerModule` que
 * monta `WorkerModule` (import explícito; con Nest 11, otro `forRoot` duplicaría sus procesadores).
 */
@Module({})
export class BillingWorkerModule {
  static forRoot(env: BillingWorkerEnv, storage: DynamicModule): DynamicModule {
    return {
      module: BillingWorkerModule,
      imports: [
        BillingModule,
        BillingChargingModule,
        AuditModule,
        IdentityReadersModule,
        NotificationsWorkerModule,
        storage,
        BullModule.registerQueue(
          { name: SUBSCRIPTION_RECONCILE_QUEUE },
          { name: INVOICE_RETRY_QUEUE },
          { name: SUBSCRIPTION_RENEWAL_QUEUE },
        ),
      ],
      providers: [
        ...configProviders(env),
        SubscriptionReconcilerService,
        SubscriptionReconcileScheduler,
        SubscriptionReconcileProcessor,
        { provide: I_INVOICE_GENERATOR, useClass: PdfInvoiceGenerator },
        { provide: I_PENDING_INVOICE_SCANNER, useClass: SqlPendingInvoiceScanner },
        InvoiceIssuer,
        InvoiceRetrier,
        InvoiceRetryScheduler,
        InvoiceRetryProcessor,
        ...RENEWAL_PROVIDERS,
      ],
    };
  }
}
