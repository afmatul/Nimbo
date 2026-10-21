import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { z } from 'zod';

import type { workerEnvSchema } from '../../shared';
import { IdentityReadersModule } from '../identity';
import { NotificationsWorkerModule } from '../notifications';

import { InvoiceIssuer } from './application/invoice-issuer';
import { InvoiceRetrier } from './application/invoice-retrier';
import { INVOICE_RETRY_CONFIG } from './application/invoice-retry-config';
import type { InvoiceRetryConfig } from './application/invoice-retry-config';
import { I_INVOICE_GENERATOR } from './application/ports/i-invoice-generator.port';
import { I_PENDING_INVOICE_SCANNER } from './application/ports/i-pending-invoice.scanner.port';
import { SUBSCRIPTION_RECONCILE_CONFIG } from './application/subscription-reconcile-config';
import type { SubscriptionReconcileConfig } from './application/subscription-reconcile-config';
import { SubscriptionReconcilerService } from './application/subscription-reconciler.service';
import { BillingModule } from './billing.module';
import { PdfInvoiceGenerator } from './infrastructure/adapters/pdf-invoice-generator';
import { InvoiceRetryProcessor } from './infrastructure/invoice-retry.processor';
import {
  INVOICE_RETRY_QUEUE,
  InvoiceRetryScheduler,
} from './infrastructure/invoice-retry.scheduler';
import { SqlPendingInvoiceScanner } from './infrastructure/persistence/sql-pending-invoice.scanner';
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
>;

/**
 * Parte de `billing` que corre en el `worker` (spec 009): las colas `subscription-reconcile` (CA-2) e `invoice-retry`
 * (CA-6), sus programas repetibles y sus procesadores. El alta Personal viene de `BillingModule`, la lista de clientes
 * verificados de `IdentityReadersModule` y la subida del PDF de la **misma** instancia de `StorageWorkerModule` que
 * monta `WorkerModule` (import explícito; con Nest 11, otro `forRoot` duplicaría sus procesadores).
 */
@Module({})
export class BillingWorkerModule {
  static forRoot(env: BillingWorkerEnv, storage: DynamicModule): DynamicModule {
    const reconcileConfig: SubscriptionReconcileConfig = {
      intervalMinutes: env.SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES,
      batchSize: env.SUBSCRIPTION_RECONCILE_BATCH_SIZE,
    };
    const retryConfig: InvoiceRetryConfig = {
      intervalMinutes: env.INVOICE_RETRY_INTERVAL_MINUTES,
      batchSize: env.INVOICE_RETRY_BATCH_SIZE,
    };
    return {
      module: BillingWorkerModule,
      imports: [
        BillingModule,
        IdentityReadersModule,
        NotificationsWorkerModule,
        storage,
        BullModule.registerQueue(
          { name: SUBSCRIPTION_RECONCILE_QUEUE },
          { name: INVOICE_RETRY_QUEUE },
        ),
      ],
      providers: [
        { provide: SUBSCRIPTION_RECONCILE_CONFIG, useValue: reconcileConfig },
        SubscriptionReconcilerService,
        SubscriptionReconcileScheduler,
        SubscriptionReconcileProcessor,
        { provide: INVOICE_RETRY_CONFIG, useValue: retryConfig },
        { provide: I_INVOICE_GENERATOR, useClass: PdfInvoiceGenerator },
        { provide: I_PENDING_INVOICE_SCANNER, useClass: SqlPendingInvoiceScanner },
        InvoiceIssuer,
        InvoiceRetrier,
        InvoiceRetryScheduler,
        InvoiceRetryProcessor,
      ],
    };
  }
}
