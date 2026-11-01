import type {
  IJobQueue,
  OptimizationTask,
} from '../../src/modules/optimizer/application/ports/i-job-queue.port';
import type { IJobRepository } from '../../src/modules/optimizer/application/ports/i-job.repository.port';
import type {
  ImageInspection,
  IOptimizer,
} from '../../src/modules/optimizer/application/ports/i-optimizer.port';
import type { OptimizationJob } from '../../src/modules/optimizer/domain/optimization-job';
import type { Actor } from '../../src/shared';

import type { Journal } from './storage-fakes';

/**
 * `IJobRepository` en memoria con las mismas garantías que la tabla: a lo sumo una optimización en curso por archivo
 * (`uq_optimizacion_en_curso`) y transiciones con comparar y asignar sobre estado y `actualizado_en`.
 */
export class FakeJobRepository implements IJobRepository {
  readonly jobs = new Map<string, OptimizationJob>();

  constructor(private readonly journal: Journal) {}

  findById(_actor: Actor, id: string): Promise<OptimizationJob | null> {
    this.journal.add('jobs:findById');
    return Promise.resolve(this.jobs.get(id) ?? null);
  }

  latestOf(_actor: Actor, fileId: string): Promise<OptimizationJob | null> {
    this.journal.add('jobs:latestOf');
    const latest = this.of(fileId).sort(
      (a, b) => b.snapshot().createdAt.getTime() - a.snapshot().createdAt.getTime(),
    )[0];
    return Promise.resolve(latest ?? null);
  }

  findInProgress(_actor: Actor, fileId: string): Promise<OptimizationJob | null> {
    this.journal.add('jobs:findInProgress');
    return Promise.resolve(this.of(fileId).find((job) => job.isInProgress) ?? null);
  }

  insertIfNoneInProgress(_actor: Actor, job: OptimizationJob): Promise<boolean> {
    this.journal.add(`jobs:insert:${job.state}`);
    const clash = job.isInProgress && this.of(job.fileId).some((other) => other.isInProgress);
    if (clash) return Promise.resolve(false);
    this.jobs.set(job.id, job);
    return Promise.resolve(true);
  }

  compareAndSet(_actor: Actor, next: OptimizationJob, previous: OptimizationJob): Promise<boolean> {
    this.journal.add(`jobs:compareAndSet:${next.state}`);
    const stored = this.jobs.get(previous.id)?.snapshot();
    const expected = previous.snapshot();
    const matches =
      stored?.state === expected.state &&
      stored.updatedAt.getTime() === expected.updatedAt.getTime();
    if (matches) this.jobs.set(next.id, next);
    return Promise.resolve(matches);
  }

  /** Siembra una fila tal cual (p. ej. una estimación ya resuelta por el `worker`). */
  seed(job: OptimizationJob): OptimizationJob {
    this.jobs.set(job.id, job);
    return job;
  }

  private of(fileId: string): OptimizationJob[] {
    return [...this.jobs.values()].filter((job) => job.fileId === fileId);
  }
}

/** `IJobQueue` que anota lo encolado; `failure` hace fallar el próximo encolado (Redis caído). */
export class FakeJobQueue implements IJobQueue {
  readonly estimates: OptimizationTask[] = [];
  readonly runs: OptimizationTask[] = [];
  failure: Error | null = null;

  constructor(private readonly journal: Journal) {}

  enqueueEstimate(task: OptimizationTask): Promise<void> {
    this.journal.add('queue:estimate');
    const failure = this.failure;
    this.failure = null;
    if (failure !== null) return Promise.reject(failure);
    this.estimates.push(task);
    return Promise.resolve();
  }

  enqueueRun(task: OptimizationTask): Promise<void> {
    this.journal.add('queue:run');
    const failure = this.failure;
    this.failure = null;
    if (failure !== null) return Promise.reject(failure);
    this.runs.push(task);
    return Promise.resolve();
  }
}

/** Una inspección de JPEG de 12 MP sin animación; las pruebas cambian lo que necesitan. */
export const inspectionOf = (overrides: Partial<ImageInspection> = {}): ImageInspection => ({
  format: 'jpeg',
  width: 4000,
  height: 3000,
  pixels: 12_000_000,
  orientation: null,
  hasIccProfile: false,
  hasExif: false,
  hasAlpha: false,
  animated: false,
  ...overrides,
});

/**
 * `IOptimizer` programable: devuelve `inspection` y un resultado de `resultBytes` bytes, o lanza el error configurado
 * en cada paso. Anota lo que recibe para comprobar que el contenido es el de la versión de origen.
 */
export class FakeOptimizer implements IOptimizer {
  inspection: ImageInspection = inspectionOf();
  resultBytes = 1;
  inspectFailure: Error | null = null;
  optimizeFailure: Error | null = null;
  readonly inspected: Buffer[] = [];
  readonly optimized: Buffer[] = [];

  inspect(content: Buffer): Promise<ImageInspection> {
    this.inspected.push(content);
    return this.inspectFailure === null
      ? Promise.resolve(this.inspection)
      : Promise.reject(this.inspectFailure);
  }

  optimize(content: Buffer): Promise<Buffer> {
    this.optimized.push(content);
    return this.optimizeFailure === null
      ? Promise.resolve(Buffer.alloc(this.resultBytes))
      : Promise.reject(this.optimizeFailure);
  }
}
