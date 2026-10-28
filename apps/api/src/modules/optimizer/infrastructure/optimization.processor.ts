import { randomUUID } from 'node:crypto';

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { CorrelationContext, errorClassOf } from '../../../shared';
import { OptimizationRunner } from '../application/optimization-runner';
import type { OptimizationTask } from '../application/ports/i-job-queue.port';

import { ESTIMATE_JOB, OPTIMIZATION_QUEUE, RUN_JOB } from './bullmq-job.queue';

/** Datos de un trabajo `optimization`: los ids y el `correlationId` que agrega `enqueueWithCorrelation`. */
export type OptimizationJobData = OptimizationTask & { readonly correlationId?: string };

/** Una optimización a la vez (plan 021 §6): dos de ~300 MB no caben en el `worker` de 768 MB. */
const WORKER_OPTIONS = { concurrency: 1 } as const;
/** Sin `attempts`, BullMQ intenta una sola vez. */
const DEFAULT_ATTEMPTS = 1;

type ProcessorLogger = Pick<PinoLogger, 'info' | 'warn' | 'error'>;

/** Solo los ids: el resto de los datos del trabajo no entra al flujo. */
const taskOf = ({ optimizationId, fileId, ownerId }: OptimizationJobData): OptimizationTask => ({
  optimizationId,
  fileId,
  ownerId,
});

const attemptsExhausted = (job: Job<OptimizationJobData>): boolean =>
  job.attemptsMade >= (job.opts.attempts ?? DEFAULT_ATTEMPTS);

/** Corre `work` con el `correlationId` del trabajo (o uno nuevo) y su `jobId` (RNF-17). */
function inJobContext<T>(job: Job<OptimizationJobData>, work: () => Promise<T>): Promise<T> {
  const store = { correlationId: job.data.correlationId ?? randomUUID(), jobId: String(job.id) };
  return CorrelationContext.run(store, work);
}

/**
 * Consumidor de la cola `optimization` en el `worker` (plan 021 §2, como `IndexingProcessor`), con concurrencia 1.
 * Delega en `OptimizationRunner`, que solo lanza errores transitorios: BullMQ reintenta con espera exponencial y,
 * agotados los intentos, este procesador llama a `giveUp` para dejarla `fallida(servicio_no_disponible)` (CA-14).
 * Despacha `estimate` y `run`; BullMQ no decide el estado de negocio.
 */
@Processor(OPTIMIZATION_QUEUE, WORKER_OPTIONS)
export class OptimizationProcessor extends WorkerHost {
  constructor(
    @Inject(OptimizationRunner) private readonly runner: OptimizationRunner,
    @Inject(PinoLogger) private readonly logger: ProcessorLogger,
  ) {
    super();
  }

  process(job: Job<OptimizationJobData>): Promise<void> {
    if (job.name === ESTIMATE_JOB)
      return inJobContext(job, () => this.runner.estimate(taskOf(job.data)));
    if (job.name === RUN_JOB) return inJobContext(job, () => this.runner.run(taskOf(job.data)));
    return Promise.reject(new TypeError('Trabajo de optimización desconocido.'));
  }

  /**
   * Último intento fallido → `giveUp`. BullMQ no espera a los oyentes: un fallo aquí se registra y no se propaga; la
   * fila queda en curso y la caducidad perezosa del `api` la cierra (plan §5).
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<OptimizationJobData> | undefined, error: Error): Promise<void> {
    if (job === undefined || !attemptsExhausted(job)) return;
    const task = taskOf(job.data);
    await inJobContext(job, async () => {
      try {
        await this.runner.giveUp(task, error);
      } catch (failure) {
        this.logger.error({
          event: 'optimization.give_up_failed',
          fileId: task.fileId,
          optimizationId: task.optimizationId,
          errorClass: errorClassOf(failure),
        });
      }
    });
  }
}
