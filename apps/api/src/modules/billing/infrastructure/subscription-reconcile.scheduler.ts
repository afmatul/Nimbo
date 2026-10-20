import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { JobSchedulerTemplateOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import type { BillingLogger } from '../application/billing-logger';
import { SUBSCRIPTION_RECONCILE_CONFIG } from '../application/subscription-reconcile-config';
import type { SubscriptionReconcileConfig } from '../application/subscription-reconcile-config';

/** Cola de la conciliación de suscripciones (plan 009 §2). */
export const SUBSCRIPTION_RECONCILE_QUEUE = 'subscription-reconcile';
export const SUBSCRIPTION_RECONCILE_JOB_NAME = 'reconcile';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const SUBSCRIPTION_RECONCILE_SCHEDULER_ID = 'subscription-reconcile';

const MINUTE_MS = 60_000;
/** Tres intentos con espera exponencial (plan 009 §2): 30 s y 60 s. */
const RECONCILE_ATTEMPTS = 3;
const RECONCILE_BACKOFF_DELAY_MS = 30_000;
/** Los fallidos se conservan un día para el tablero del Operador y la alerta de reintentos. */
const FAILED_RETENTION_SECONDS = 86_400;

export const SUBSCRIPTION_RECONCILE_JOB_OPTIONS: Readonly<JobSchedulerTemplateOptions> =
  Object.freeze({
    attempts: RECONCILE_ATTEMPTS,
    backoff: Object.freeze({ type: 'exponential', delay: RECONCILE_BACKOFF_DELAY_MS }),
    removeOnComplete: true,
    removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
  });

/** Datos del trabajo: solo el `correlationId` (RNF-17). */
export interface SubscriptionReconcileJobData {
  readonly correlationId: string;
}

/**
 * Registra el programa repetible de `subscription-reconcile` al arrancar el `worker` (CA-2). Copia el patrón de
 * `UsageReconcileScheduler` de `storage`; la extracción del patrón está en PD-63.
 */
@Injectable()
export class SubscriptionReconcileScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(SUBSCRIPTION_RECONCILE_QUEUE) private readonly queue: Queue,
    @Inject(SUBSCRIPTION_RECONCILE_CONFIG) private readonly config: SubscriptionReconcileConfig,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const data: SubscriptionReconcileJobData = {
      correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
    };
    await this.queue.upsertJobScheduler(
      SUBSCRIPTION_RECONCILE_SCHEDULER_ID,
      { every: this.config.intervalMinutes * MINUTE_MS },
      { name: SUBSCRIPTION_RECONCILE_JOB_NAME, data, opts: SUBSCRIPTION_RECONCILE_JOB_OPTIONS },
    );
    this.logger.info({
      event: 'billing.reconcile_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
