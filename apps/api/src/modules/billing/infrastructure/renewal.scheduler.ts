import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { scheduleRepeatableJob } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';
import { RENEWAL_SCHEDULE_CONFIG } from '../application/renewal-config';
import type { RenewalScheduleConfig } from '../application/renewal-config';

/** Cola de la renovación automática, el vencimiento y el aviso previo (spec 010 plan §2). */
export const SUBSCRIPTION_RENEWAL_QUEUE = 'subscription-renewal';
export const SUBSCRIPTION_RENEWAL_JOB_NAME = 'renew';
/** Id fijo del programa: un solo programa aunque arranquen varios `worker`. */
export const SUBSCRIPTION_RENEWAL_SCHEDULER_ID = 'subscription-renewal';

/**
 * `RenewalScheduler` del diagrama (DF-77: BullMQ en lugar de `@Cron`): registra la pasada cada
 * `SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES` con `scheduleRepeatableJob` de `shared` (PD-63).
 */
@Injectable()
export class RenewalScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(SUBSCRIPTION_RENEWAL_QUEUE) private readonly queue: Queue,
    @Inject(RENEWAL_SCHEDULE_CONFIG) private readonly config: RenewalScheduleConfig,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await scheduleRepeatableJob(this.queue, {
      schedulerId: SUBSCRIPTION_RENEWAL_SCHEDULER_ID,
      jobName: SUBSCRIPTION_RENEWAL_JOB_NAME,
      intervalMinutes: this.config.intervalMinutes,
    });
    this.logger.info({
      event: 'billing.renewal_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
