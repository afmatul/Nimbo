import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { scheduleRepeatableJob } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';
import { SUBSCRIPTION_RECONCILE_CONFIG } from '../application/subscription-reconcile-config';
import type { SubscriptionReconcileConfig } from '../application/subscription-reconcile-config';

/** Cola de la conciliación de suscripciones (plan 009 §2). */
export const SUBSCRIPTION_RECONCILE_QUEUE = 'subscription-reconcile';
export const SUBSCRIPTION_RECONCILE_JOB_NAME = 'reconcile';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const SUBSCRIPTION_RECONCILE_SCHEDULER_ID = 'subscription-reconcile';

/**
 * Registra el programa repetible de `subscription-reconcile` al arrancar el `worker` (CA-2) con
 * `scheduleRepeatableJob` de `shared` (PD-63).
 */
@Injectable()
export class SubscriptionReconcileScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(SUBSCRIPTION_RECONCILE_QUEUE) private readonly queue: Queue,
    @Inject(SUBSCRIPTION_RECONCILE_CONFIG) private readonly config: SubscriptionReconcileConfig,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await scheduleRepeatableJob(this.queue, {
      schedulerId: SUBSCRIPTION_RECONCILE_SCHEDULER_ID,
      jobName: SUBSCRIPTION_RECONCILE_JOB_NAME,
      intervalMinutes: this.config.intervalMinutes,
    });
    this.logger.info({
      event: 'billing.reconcile_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
