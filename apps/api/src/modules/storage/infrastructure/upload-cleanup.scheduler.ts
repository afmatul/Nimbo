import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { JobSchedulerTemplateOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import type { StorageLogger } from '../application/storage-logger';

/** Cola del barrido de cargas vencidas (plan §5 «Colas», D-6; arquitectura §8). */
export const UPLOAD_CLEANUP_QUEUE = 'upload-cleanup';
export const UPLOAD_CLEANUP_JOB_NAME = 'sweep';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const UPLOAD_CLEANUP_SCHEDULER_ID = 'upload-cleanup';

const MINUTE_MS = 60_000;
/** Tres intentos con espera exponencial (arquitectura §8): 30 s y 60 s, muy por debajo del intervalo. */
const CLEANUP_ATTEMPTS = 3;
const CLEANUP_BACKOFF_DELAY_MS = 30_000;
/** Los fallidos se conservan un día para el tablero del Operador y la alerta de reintentos. */
const FAILED_RETENTION_SECONDS = 86_400;

export const UPLOAD_CLEANUP_JOB_OPTIONS: Readonly<JobSchedulerTemplateOptions> = Object.freeze({
  attempts: CLEANUP_ATTEMPTS,
  backoff: Object.freeze({ type: 'exponential', delay: CLEANUP_BACKOFF_DELAY_MS }),
  removeOnComplete: true,
  removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
});

/** Datos del trabajo: solo el `correlationId` (RNF-17). */
export interface UploadCleanupJobData {
  readonly correlationId: string;
}

/** Configuración del barrido (`UPLOAD_CLEANUP_INTERVAL_MINUTES`, `UPLOAD_CLEANUP_BATCH_SIZE`; plan §5). */
export interface UploadCleanupConfig {
  readonly intervalMinutes: number;
  readonly batchSize: number;
}

export const UPLOAD_CLEANUP_CONFIG = Symbol('UPLOAD_CLEANUP_CONFIG');

/**
 * Registra el programa repetible de `upload-cleanup` al arrancar el `worker` (D-6), sin `@nestjs/schedule`:
 * `upsertJobScheduler` es idempotente, así que reiniciar o escalar el `worker` no duplica ejecuciones.
 */
@Injectable()
export class UploadCleanupScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(UPLOAD_CLEANUP_QUEUE) private readonly queue: Queue,
    @Inject(UPLOAD_CLEANUP_CONFIG) private readonly config: UploadCleanupConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const data: UploadCleanupJobData = {
      correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
    };
    await this.queue.upsertJobScheduler(
      UPLOAD_CLEANUP_SCHEDULER_ID,
      { every: this.config.intervalMinutes * MINUTE_MS },
      { name: UPLOAD_CLEANUP_JOB_NAME, data, opts: UPLOAD_CLEANUP_JOB_OPTIONS },
    );
    this.logger.info({
      event: 'upload.cleanup_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
