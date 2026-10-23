import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { scheduleRepeatableJob } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

/** Cola de la purga de la papelera (plan 006 §4; arquitectura §8). */
export const TRASH_PURGE_QUEUE = 'trash-purge';
export const TRASH_PURGE_JOB_NAME = 'purge';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const TRASH_PURGE_SCHEDULER_ID = 'trash-purge';

/** Configuración de la purga (`TRASH_PURGE_INTERVAL_MINUTES`, `TRASH_PURGE_BATCH_SIZE`; plan 006 §7). */
export interface TrashPurgeConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const TRASH_PURGE_CONFIG = Symbol('TRASH_PURGE_CONFIG');

/**
 * Registra el programa repetible de `trash-purge` al arrancar el `worker` (CA-19) con `scheduleRepeatableJob` de
 * `shared` (PD-63): reiniciar o escalar no duplica ejecuciones.
 */
@Injectable()
export class TrashPurgeScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(TRASH_PURGE_QUEUE) private readonly queue: Queue,
    @Inject(TRASH_PURGE_CONFIG) private readonly config: TrashPurgeConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await scheduleRepeatableJob(this.queue, {
      schedulerId: TRASH_PURGE_SCHEDULER_ID,
      jobName: TRASH_PURGE_JOB_NAME,
      intervalMinutes: this.config.intervalMinutes,
    });
    this.logger.info({
      event: 'trash.purge_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
