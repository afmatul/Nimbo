import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { JobSchedulerTemplateOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';
import { INVOICE_RETRY_CONFIG } from '../application/invoice-retry-config';
import type { InvoiceRetryConfig } from '../application/invoice-retry-config';

/** Cola del reintento de facturas sin PDF (plan 009 §2, T-07). */
export const INVOICE_RETRY_QUEUE = 'invoice-retry';
export const INVOICE_RETRY_JOB_NAME = 'retry';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const INVOICE_RETRY_SCHEDULER_ID = 'invoice-retry';

const MINUTE_MS = 60_000;
/** Tres intentos con espera exponencial (plan 009 §2): 30 s y 60 s. */
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_DELAY_MS = 30_000;
/** Los fallidos se conservan un día para el tablero del Operador y la alerta de reintentos. */
const FAILED_RETENTION_SECONDS = 86_400;

export const INVOICE_RETRY_JOB_OPTIONS: Readonly<JobSchedulerTemplateOptions> = Object.freeze({
  attempts: RETRY_ATTEMPTS,
  backoff: Object.freeze({ type: 'exponential', delay: RETRY_BACKOFF_DELAY_MS }),
  removeOnComplete: true,
  removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
});

/** Datos del trabajo: solo el `correlationId` (RNF-17). */
export interface InvoiceRetryJobData {
  readonly correlationId: string;
}

/**
 * Registra el programa repetible de `invoice-retry` al arrancar el `worker` (CA-6, cada minuto). Copia el patrón de
 * `SubscriptionReconcileScheduler`; la extracción del patrón está en PD-63.
 */
@Injectable()
export class InvoiceRetryScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(INVOICE_RETRY_QUEUE) private readonly queue: Queue,
    @Inject(INVOICE_RETRY_CONFIG) private readonly config: InvoiceRetryConfig,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const data: InvoiceRetryJobData = {
      correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
    };
    await this.queue.upsertJobScheduler(
      INVOICE_RETRY_SCHEDULER_ID,
      { every: this.config.intervalMinutes * MINUTE_MS },
      { name: INVOICE_RETRY_JOB_NAME, data, opts: INVOICE_RETRY_JOB_OPTIONS },
    );
    this.logger.info({
      event: 'billing.invoice_retry_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
