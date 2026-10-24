import { randomUUID } from 'node:crypto';

import type { Job, JobSchedulerTemplateOptions, Queue } from 'bullmq';

import { CorrelationContext } from '../correlation/correlation-context';

import type { CorrelatedJobData } from './enqueue-with-correlation';

const MINUTE_MS = 60_000;
/** Tres intentos con espera exponencial (arquitectura §8): 30 s y 60 s, por debajo de cualquier intervalo. */
const ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 30_000;
/** Los fallidos se conservan un día para el tablero del Operador y la alerta de reintentos. */
const FAILED_RETENTION_SECONDS = 86_400;

/** Opciones de toda pasada programada del `worker` (PD-63; 005, 006, 007, 009, 010). */
export const REPEATABLE_JOB_OPTIONS: Readonly<JobSchedulerTemplateOptions> = Object.freeze({
  attempts: ATTEMPTS,
  backoff: Object.freeze({ type: 'exponential', delay: BACKOFF_DELAY_MS }),
  removeOnComplete: true,
  removeOnFail: Object.freeze({ age: FAILED_RETENTION_SECONDS }),
});

/** Qué programa repetible registrar: el id fijo del programa, el nombre del trabajo y cada cuántos minutos. */
export interface RepeatableSchedule {
  readonly schedulerId: string;
  readonly jobName: string;
  readonly intervalMinutes: number;
}

/**
 * Registra el programa repetible al arrancar el `worker` (PD-63). `upsertJobScheduler` con el mismo id deja **un**
 * programa aunque reinicien o escalen varios `worker`. Los datos son solo el `correlationId` (RNF-17).
 */
export const scheduleRepeatableJob = async (
  queue: Queue,
  { schedulerId, jobName, intervalMinutes }: RepeatableSchedule,
): Promise<void> => {
  const data: CorrelatedJobData = {
    correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
  };
  await queue.upsertJobScheduler(
    schedulerId,
    { every: intervalMinutes * MINUTE_MS },
    { name: jobName, data, opts: REPEATABLE_JOB_OPTIONS },
  );
};

/** El procesador corre la pasada con el `correlationId` que viajó en el trabajo (o uno nuevo) y su `jobId` (CA-14). */
export const runWithJobCorrelation = <T>(
  job: Job<Partial<CorrelatedJobData>>,
  work: () => Promise<T>,
): Promise<T> =>
  CorrelationContext.run(
    { correlationId: job.data.correlationId ?? randomUUID(), jobId: String(job.id) },
    work,
  );
