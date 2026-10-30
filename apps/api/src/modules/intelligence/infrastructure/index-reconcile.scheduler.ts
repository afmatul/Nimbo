import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { JobSchedulerTemplateOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext } from '../../../shared';
import { INDEX_RECONCILE_CONFIG } from '../application/index-reconciler';
import type { IndexReconcileConfig } from '../application/index-reconciler';
import type { IntelligenceLogger } from '../application/intelligence-logger';

/** Cola de la conciliación de la indexación (plan 019 §2, RN-12). */
export const INDEX_RECONCILE_QUEUE = 'index-reconcile';
export const INDEX_RECONCILE_JOB_NAME = 'reconcile';
/** Id fijo del programa: `upsertJobScheduler` con el mismo id deja **un** programa aunque arranquen varios `worker`. */
export const INDEX_RECONCILE_SCHEDULER_ID = 'index-reconcile';

const MINUTE_MS = 60_000;
/** Tres intentos con espera exponencial, como las demás conciliaciones: 30 s y 60 s. */
const RECONCILE_ATTEMPTS = 3;
const RECONCILE_BACKOFF_DELAY_MS = 30_000;
/** Los fallidos se conservan un día para el tablero del Operador y la alerta de reintentos. */
const FAILED_RETENTION_SECONDS = 86_400;

export const INDEX_RECONCILE_JOB_OPTIONS: Readonly<JobSchedulerTemplateOptions> = Object.freeze({
  attempts: RECONCILE_ATTEMPTS,
  backoff: Object.freeze({ type: 'exponential', delay: RECONCILE_BACKOFF_DELAY_MS }),
  removeOnComplete: true,
  removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
});

/** Datos del trabajo: solo el `correlationId` (RNF-17). */
export interface IndexReconcileJobData {
  readonly correlationId: string;
}

/**
 * Lanza la conciliación una vez, con las mismas opciones que el programa: lo usan el script del Operador
 * `index:reconcile` y, cuando exista el corpus, `pnpm seed` (019 RN-12, D-5).
 */
export async function requestIndexReconcile(queue: Queue, correlationId: string): Promise<void> {
  const data: IndexReconcileJobData = { correlationId };
  await queue.add(INDEX_RECONCILE_JOB_NAME, data, INDEX_RECONCILE_JOB_OPTIONS);
}

/**
 * Registra el programa repetible de `index-reconcile` al arrancar el `worker` (plan 019 §2), cada
 * `INDEX_RECONCILE_INTERVAL_MINUTES`. Copia el patrón de `UsageReconcileScheduler`; su extracción está en PD-63.
 */
@Injectable()
export class IndexReconcileScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(INDEX_RECONCILE_QUEUE) private readonly queue: Queue,
    @Inject(INDEX_RECONCILE_CONFIG) private readonly config: IndexReconcileConfig,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const data: IndexReconcileJobData = {
      correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
    };
    await this.queue.upsertJobScheduler(
      INDEX_RECONCILE_SCHEDULER_ID,
      { every: this.config.intervalMinutes * MINUTE_MS },
      { name: INDEX_RECONCILE_JOB_NAME, data, opts: INDEX_RECONCILE_JOB_OPTIONS },
    );
    this.logger.info({
      event: 'index.reconcile_scheduled',
      intervalMinutes: this.config.intervalMinutes,
    });
  }
}
