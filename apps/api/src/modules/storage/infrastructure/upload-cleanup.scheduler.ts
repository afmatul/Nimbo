import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { scheduleRepeatableJob } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

/** Cola del barrido de cargas vencidas (plan §5 «Colas», D-6; arquitectura §8). */
export const UPLOAD_CLEANUP_QUEUE = 'upload-cleanup';
export const UPLOAD_CLEANUP_JOB_NAME = 'sweep';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const UPLOAD_CLEANUP_SCHEDULER_ID = 'upload-cleanup';

/** Configuración del barrido (`UPLOAD_CLEANUP_INTERVAL_MINUTES`, `UPLOAD_CLEANUP_BATCH_SIZE`; plan §5). */
export interface UploadCleanupConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const UPLOAD_CLEANUP_CONFIG = Symbol('UPLOAD_CLEANUP_CONFIG');

/**
 * Registra el programa repetible de `upload-cleanup` al arrancar el `worker` (D-6), sin `@nestjs/schedule`, con
 * `scheduleRepeatableJob` de `shared` (PD-63): reiniciar o escalar el `worker` no duplica ejecuciones.
 */
@Injectable()
export class UploadCleanupScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(UPLOAD_CLEANUP_QUEUE) private readonly queue: Queue,
    @Inject(UPLOAD_CLEANUP_CONFIG) private readonly config: UploadCleanupConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await scheduleRepeatableJob(this.queue, {
      schedulerId: UPLOAD_CLEANUP_SCHEDULER_ID,
      jobName: UPLOAD_CLEANUP_JOB_NAME,
      intervalMinutes: this.config.intervalMinutes,
    });
    this.logger.info({
      event: 'upload.cleanup_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
