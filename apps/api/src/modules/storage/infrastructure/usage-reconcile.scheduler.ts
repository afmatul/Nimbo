import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { JobSchedulerTemplateOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

/** Cola de la conciliación de `espacio_usado` (plan 007 §4; arquitectura §8). */
export const USAGE_RECONCILE_QUEUE = 'usage-reconcile';
export const USAGE_RECONCILE_JOB_NAME = 'reconcile';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const USAGE_RECONCILE_SCHEDULER_ID = 'usage-reconcile';

const MINUTE_MS = 60_000;
/** Tres intentos con espera exponencial (plan 007 §4): 30 s y 60 s. */
const RECONCILE_ATTEMPTS = 3;
const RECONCILE_BACKOFF_DELAY_MS = 30_000;
/** Los fallidos se conservan un día para el tablero del Operador y la alerta de reintentos. */
const FAILED_RETENTION_SECONDS = 86_400;

export const USAGE_RECONCILE_JOB_OPTIONS: Readonly<JobSchedulerTemplateOptions> = Object.freeze({
  attempts: RECONCILE_ATTEMPTS,
  backoff: Object.freeze({ type: 'exponential', delay: RECONCILE_BACKOFF_DELAY_MS }),
  removeOnComplete: true,
  removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
});

/** Datos del trabajo: solo el `correlationId` (RNF-17). */
export interface UsageReconcileJobData {
  readonly correlationId: string;
}

/** Configuración de la conciliación (`USAGE_RECONCILE_INTERVAL_MINUTES`, `USAGE_RECONCILE_BATCH_SIZE`). */
export interface UsageReconcileConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const USAGE_RECONCILE_CONFIG = Symbol('USAGE_RECONCILE_CONFIG');

/**
 * Registra el programa repetible de `usage-reconcile` al arrancar el `worker` (CA-13), con el mismo criterio que
 * `TrashPurgeScheduler` (D-13: tercera copia del patrón, se extrae en el refactor de la fase).
 */
@Injectable()
export class UsageReconcileScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(USAGE_RECONCILE_QUEUE) private readonly queue: Queue,
    @Inject(USAGE_RECONCILE_CONFIG) private readonly config: UsageReconcileConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const data: UsageReconcileJobData = {
      correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
    };
    await this.queue.upsertJobScheduler(
      USAGE_RECONCILE_SCHEDULER_ID,
      { every: this.config.intervalMinutes * MINUTE_MS },
      { name: USAGE_RECONCILE_JOB_NAME, data, opts: USAGE_RECONCILE_JOB_OPTIONS },
    );
    this.logger.info({
      event: 'quota.reconcile_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
