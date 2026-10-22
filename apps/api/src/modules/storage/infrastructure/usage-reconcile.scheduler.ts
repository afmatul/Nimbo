import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { scheduleRepeatableJob } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

/** Cola de la conciliación de `espacio_usado` (plan 007 §4; arquitectura §8). */
export const USAGE_RECONCILE_QUEUE = 'usage-reconcile';
export const USAGE_RECONCILE_JOB_NAME = 'reconcile';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const USAGE_RECONCILE_SCHEDULER_ID = 'usage-reconcile';

/** Configuración de la conciliación (`USAGE_RECONCILE_INTERVAL_MINUTES`, `USAGE_RECONCILE_BATCH_SIZE`). */
export interface UsageReconcileConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const USAGE_RECONCILE_CONFIG = Symbol('USAGE_RECONCILE_CONFIG');

/**
 * Registra el programa repetible de `usage-reconcile` al arrancar el `worker` (CA-13) con `scheduleRepeatableJob` de
 * `shared` (D-13, extraído en PD-63).
 */
@Injectable()
export class UsageReconcileScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(USAGE_RECONCILE_QUEUE) private readonly queue: Queue,
    @Inject(USAGE_RECONCILE_CONFIG) private readonly config: UsageReconcileConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await scheduleRepeatableJob(this.queue, {
      schedulerId: USAGE_RECONCILE_SCHEDULER_ID,
      jobName: USAGE_RECONCILE_JOB_NAME,
      intervalMinutes: this.config.intervalMinutes,
    });
    this.logger.info({
      event: 'quota.reconcile_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
