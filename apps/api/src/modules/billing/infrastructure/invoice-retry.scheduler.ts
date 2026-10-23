import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { scheduleRepeatableJob } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';
import { INVOICE_RETRY_CONFIG } from '../application/invoice-retry-config';
import type { InvoiceRetryConfig } from '../application/invoice-retry-config';

/** Cola del reintento de facturas sin PDF (plan 009 §2, T-07). */
export const INVOICE_RETRY_QUEUE = 'invoice-retry';
export const INVOICE_RETRY_JOB_NAME = 'retry';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const INVOICE_RETRY_SCHEDULER_ID = 'invoice-retry';

/**
 * Registra el programa repetible de `invoice-retry` al arrancar el `worker` (CA-6, cada minuto) con
 * `scheduleRepeatableJob` de `shared` (PD-63).
 */
@Injectable()
export class InvoiceRetryScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(INVOICE_RETRY_QUEUE) private readonly queue: Queue,
    @Inject(INVOICE_RETRY_CONFIG) private readonly config: InvoiceRetryConfig,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await scheduleRepeatableJob(this.queue, {
      schedulerId: INVOICE_RETRY_SCHEDULER_ID,
      jobName: INVOICE_RETRY_JOB_NAME,
      intervalMinutes: this.config.intervalMinutes,
    });
    this.logger.info({
      event: 'billing.invoice_retry_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
