import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { JobSchedulerTemplateOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

/** Cola de la purga de la papelera (plan 006 §4; arquitectura §8). */
export const TRASH_PURGE_QUEUE = 'trash-purge';
export const TRASH_PURGE_JOB_NAME = 'purge';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const TRASH_PURGE_SCHEDULER_ID = 'trash-purge';

const MINUTE_MS = 60_000;
/** Tres intentos con espera exponencial (plan 006 §4, arquitectura §8): 30 s y 60 s. */
const PURGE_ATTEMPTS = 3;
const PURGE_BACKOFF_DELAY_MS = 30_000;
/** Los fallidos se conservan un día para el tablero del Operador y la alerta de reintentos. */
const FAILED_RETENTION_SECONDS = 86_400;

export const TRASH_PURGE_JOB_OPTIONS: Readonly<JobSchedulerTemplateOptions> = Object.freeze({
  attempts: PURGE_ATTEMPTS,
  backoff: Object.freeze({ type: 'exponential', delay: PURGE_BACKOFF_DELAY_MS }),
  removeOnComplete: true,
  removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
});

/** Datos del trabajo: solo el `correlationId` (RNF-17). */
export interface TrashPurgeJobData {
  readonly correlationId: string;
}

/** Configuración de la purga (`TRASH_PURGE_INTERVAL_MINUTES`, `TRASH_PURGE_BATCH_SIZE`; plan 006 §7). */
export interface TrashPurgeConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const TRASH_PURGE_CONFIG = Symbol('TRASH_PURGE_CONFIG');

/**
 * Registra el programa repetible de `trash-purge` al arrancar el `worker` (CA-19), con el mismo criterio que
 * `UploadCleanupScheduler`: `upsertJobScheduler` es idempotente, así que reiniciar o escalar no duplica ejecuciones.
 */
@Injectable()
export class TrashPurgeScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(TRASH_PURGE_QUEUE) private readonly queue: Queue,
    @Inject(TRASH_PURGE_CONFIG) private readonly config: TrashPurgeConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const data: TrashPurgeJobData = {
      correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
    };
    await this.queue.upsertJobScheduler(
      TRASH_PURGE_SCHEDULER_ID,
      { every: this.config.intervalMinutes * MINUTE_MS },
      { name: TRASH_PURGE_JOB_NAME, data, opts: TRASH_PURGE_JOB_OPTIONS },
    );
    this.logger.info({
      event: 'trash.purge_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
