import { WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { Queue } from 'bullmq';
import type { Job, Worker } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { Counter, Gauge, Histogram } from 'prom-client';
import type { Registry } from 'prom-client';

import { errorClassOf } from '../../application/error-class';

import { METRICS_REGISTRY } from './metrics.module';

/** Estados que se cuentan en cada recolección (022 plan §4); `delayed` aparte de los pendientes de la regla 3 (S-2). */
const JOB_STATES = ['waiting', 'prioritized', 'active', 'delayed'] as const;
/** Intentos fallidos agrupados en `1`, `2` y `3+` (S-1): el último grupo es el que vigila la regla 3. */
const ATTEMPT_GROUPS = ['1', '2', '3+'] as const;
const LAST_ATTEMPT_GROUP = 3;
/** De 0,1 s a 600 s: el optimizador tarda hasta 100 s (022 plan §5). */
const QUEUE_DURATION_BUCKETS_SECONDS = [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600];
/** Un Redis lento o caído no retiene `/metrics`: la cuenta de esa cola se omite (RN-6). */
const JOB_COUNTS_TIMEOUT_MS = 1000;
const MS_PER_SECOND = 1000;

type QueueLabel = 'queue';

interface QueueSeries {
  readonly jobs: Gauge<QueueLabel | 'state'>;
  readonly completed: Counter<QueueLabel>;
  readonly failures: Counter<QueueLabel | 'attempts_made'>;
  readonly wait: Histogram<QueueLabel>;
  readonly run: Histogram<QueueLabel>;
}

/** El `Worker` de un procesador, o `null` si todavía no existe (el getter de `WorkerHost` lanza en ese caso, R-6). */
const workerOf = (host: WorkerHost): Worker | null => {
  try {
    return host.worker;
  } catch {
    return null;
  }
};

const queueHistogram = (registry: Registry, name: string, help: string): Histogram<QueueLabel> =>
  new Histogram({
    name,
    help,
    labelNames: ['queue'],
    buckets: QUEUE_DURATION_BUCKETS_SECONDS,
    registers: [registry],
  });

const createQueueSeries = (registry: Registry, collect: () => Promise<void>): QueueSeries => ({
  jobs: new Gauge({
    name: 'nimbo_queue_jobs',
    help: 'Trabajos por cola y estado en la última recolección',
    labelNames: ['queue', 'state'],
    registers: [registry],
    collect,
  }),
  completed: new Counter({
    name: 'nimbo_queue_jobs_completed_total',
    help: 'Trabajos completados por cola',
    labelNames: ['queue'],
    registers: [registry],
  }),
  failures: new Counter({
    name: 'nimbo_queue_job_failures_total',
    help: 'Intentos fallidos por cola y número de intentos hechos',
    labelNames: ['queue', 'attempts_made'],
    registers: [registry],
  }),
  wait: queueHistogram(registry, 'nimbo_queue_job_wait_seconds', 'Espera hasta el primer intento'),
  run: queueHistogram(registry, 'nimbo_queue_job_run_seconds', 'Duración de cada intento'),
});

const attemptGroupOf = (attemptsMade: number): string =>
  attemptsMade >= LAST_ATTEMPT_GROUP ? '3+' : String(attemptsMade);

/** Desde que el trabajo queda listo (`timestamp` + `delay`) hasta que empieza su primer intento (022 plan §4). */
const firstWaitSecondsOf = (job: Job): number | null =>
  job.attemptsMade === 0 && job.processedOn !== undefined
    ? Math.max(0, job.processedOn - job.timestamp - job.delay) / MS_PER_SECOND
    : null;

/** De `processedOn` a `finishedOn`; un intento que se reintenta no tiene `finishedOn` y termina ahora. */
const runSecondsOf = (job: Job): number | null =>
  job.processedOn === undefined
    ? null
    : ((job.finishedOn ?? Date.now()) - job.processedOn) / MS_PER_SECOND;

const withTimeout = <T>(work: Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Tiempo agotado al contar los trabajos'));
    }, JOB_COUNTS_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });

/**
 * Métricas de las colas que **consume** este proceso (022 plan §2, CA-1): descubre sus `WorkerHost`, así cubre todas
 * las colas sin listas fijas y una cola que el proceso solo produce no se cuenta dos veces. Escucha `active`,
 * `completed` y `failed` de cada `Worker` y, en cada recolección, cuenta sus trabajos por estado. Las etiquetas son
 * solo la cola, el estado y el grupo de intentos: nunca el `data` del trabajo ni su error (CA-5).
 *
 * El descubrimiento repite el de `WorkerDrain` (segunda aparición, plan R1; se extrae a la tercera, Art. VI.2).
 */
@Injectable()
export class QueueMetricsCollector implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly series: QueueSeries;
  private readonly queues: Queue[] = [];

  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(METRICS_REGISTRY) registry: Registry,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.series = createQueueSeries(registry, () => this.countJobs());
  }

  /** Los `Worker` ya existen aquí: `@nestjs/bullmq` los crea en `onModuleInit` (R-6). */
  onApplicationBootstrap(): void {
    for (const worker of this.consumedWorkers()) {
      this.watch(worker);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.queues.map((queue) => queue.close()));
  }

  private consumedWorkers(): Worker[] {
    return this.discovery
      .getProviders()
      .map((wrapper): unknown => wrapper.instance)
      .filter((instance): instance is WorkerHost => instance instanceof WorkerHost)
      .map(workerOf)
      .filter((worker): worker is Worker => worker !== null);
  }

  /** Series en cero desde el arranque: así `increase` ve también el primer fallo (reglas 3 y 6). */
  private watch(worker: Worker): void {
    const queue = worker.name;
    this.series.completed.inc({ queue }, 0);
    for (const group of ATTEMPT_GROUPS) {
      this.series.failures.inc({ queue, attempts_made: group }, 0);
    }
    worker.on('active', (job: Job) => {
      this.observe(this.series.wait, queue, firstWaitSecondsOf(job));
    });
    worker.on('completed', (job: Job) => {
      this.series.completed.inc({ queue });
      this.observe(this.series.run, queue, runSecondsOf(job));
    });
    worker.on('failed', (job: Job | undefined) => {
      if (job === undefined) return;
      this.series.failures.inc({ queue, attempts_made: attemptGroupOf(job.attemptsMade) });
      this.observe(this.series.run, queue, runSecondsOf(job));
    });
    this.queues.push(this.queueFor(worker));
  }

  private observe(histogram: Histogram<QueueLabel>, queue: string, seconds: number | null): void {
    if (seconds !== null) histogram.observe({ queue }, seconds);
  }

  /**
   * Lector de la cola con la misma conexión y prefijo que su `Worker`. Los errores de conexión ya los informa el
   * `Worker`; aquí solo se escuchan para que no tumben el proceso (RN-6).
   */
  private queueFor(worker: Worker): Queue {
    const { connection, prefix } = worker.opts;
    const queue = new Queue(
      worker.name,
      prefix === undefined ? { connection } : { connection, prefix },
    );
    queue.on('error', () => undefined);
    return queue;
  }

  private async countJobs(): Promise<void> {
    this.series.jobs.reset();
    await Promise.all(this.queues.map((queue) => this.countJobsOf(queue)));
  }

  private async countJobsOf(queue: Queue): Promise<void> {
    try {
      const counts = await withTimeout(queue.getJobCounts(...JOB_STATES));
      for (const state of JOB_STATES) {
        this.series.jobs.set({ queue: queue.name, state }, counts[state] ?? 0);
      }
    } catch (error) {
      this.logger.warn({
        event: 'metrics.collect_failed',
        queue: queue.name,
        errorClass: errorClassOf(error),
      });
    }
  }
}
