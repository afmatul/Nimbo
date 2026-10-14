import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { z } from 'zod';

import type { workerEnvSchema } from '../../shared';
import { IdentityWorkerModule } from '../identity';

import { SUBSCRIPTION_RECONCILE_CONFIG } from './application/subscription-reconcile-config';
import type { SubscriptionReconcileConfig } from './application/subscription-reconcile-config';
import { SubscriptionReconcilerService } from './application/subscription-reconciler.service';
import { BillingModule } from './billing.module';
import { SubscriptionReconcileProcessor } from './infrastructure/subscription-reconcile.processor';
import {
  SUBSCRIPTION_RECONCILE_QUEUE,
  SubscriptionReconcileScheduler,
} from './infrastructure/subscription-reconcile.scheduler';

/** Variables del `worker` que `billing` usa (plan 009 §2). */
export type BillingWorkerEnv = Pick<
  z.infer<typeof workerEnvSchema>,
  'SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES' | 'SUBSCRIPTION_RECONCILE_BATCH_SIZE'
>;

/**
 * Parte de `billing` que corre en el `worker` (spec 009 CA-2): la cola `subscription-reconcile`, su programa repetible
 * y su procesador. El alta Personal viene de `BillingModule` y la lista de clientes verificados de `identity`
 * (`IdentityWorkerModule`). `apps/worker` la importa solo desde `billing/index.ts`.
 */
@Module({})
export class BillingWorkerModule {
  static forRoot(env: BillingWorkerEnv): DynamicModule {
    const reconcileConfig: SubscriptionReconcileConfig = {
      intervalMinutes: env.SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES,
      batchSize: env.SUBSCRIPTION_RECONCILE_BATCH_SIZE,
    };
    return {
      module: BillingWorkerModule,
      imports: [
        BillingModule,
        IdentityWorkerModule,
        BullModule.registerQueue({ name: SUBSCRIPTION_RECONCILE_QUEUE }),
      ],
      providers: [
        { provide: SUBSCRIPTION_RECONCILE_CONFIG, useValue: reconcileConfig },
        SubscriptionReconcilerService,
        SubscriptionReconcileScheduler,
        SubscriptionReconcileProcessor,
      ],
    };
  }
}
