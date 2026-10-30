import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  I_CLOCK,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  RateLimitExceededError,
} from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import {
  I_PLAN_LIMITS_PROVIDER,
  NodeNotFoundError,
  OptimizableFileGateway,
  WritableAccountPolicy,
} from '../../storage';
import type { IPlanLimitsProvider, OptimizableFile } from '../../storage';
import { EstimateStaleError, UnsupportedTypeError } from '../domain/errors';
import { OptimizationJob } from '../domain/optimization-job';

import { auditOptimizationOutcome } from './optimization-audit';
import { I_JOB_QUEUE } from './ports/i-job-queue.port';
import type { IJobQueue } from './ports/i-job-queue.port';
import { I_JOB_REPOSITORY } from './ports/i-job.repository.port';
import type { IJobRepository } from './ports/i-job.repository.port';

/** Valores de `env.schema.ts` que el servicio del `api` usa (plan 021 §6). */
export interface OptimizerConfig {
  /** `OPTIMIZER_MAX_FILE_BYTES`: por encima, `no_disponible(tamano)` (CA-5). */
  readonly maxFileBytes: bigint;
  /** `OPTIMIZER_MAX_ATTEMPTS × 3 × OPTIMIZER_TIMEOUT_MS` más 5 min: ventana de la caducidad perezosa (plan §5). */
  readonly staleAfterMs: number;
  /** `OPTIMIZER_POLL_INTERVAL_MS`: `pollAfterMs` mientras está en curso (RN-10). */
  readonly pollIntervalMs: number;
  /** `RATE_LIMIT_OPTIMIZER_PER_MINUTE`: calcular y optimizar, por cuenta (RNF-07). */
  readonly requestsPerMinute: number;
}

export const OPTIMIZER_CONFIG = Symbol('OptimizerConfig');

export interface RunOptimizationInput {
  readonly fileId: string;
  readonly optimizationId: string;
}

/**
 * Lo que el servicio usa de la fachada de `storage`: el archivo propio y vivo, con o sin su MIME real, y el bloqueo de su
 * versión vigente al confirmar (CA-11).
 */
export type OptimizationFiles = Pick<
  OptimizableFileGateway,
  'findOwnedImage' | 'findOwned' | 'lockCurrentVersion'
>;

/** Estado que responde `GET …/optimization`: la optimización y lo que la ficha necesita para mostrarla. */
export interface OptimizationView {
  readonly job: OptimizationJob;
  /** Solo en curso: cuándo volver a consultar. */
  readonly pollAfterMs: number | null;
  /** Solo en `estimada`: días que se conservaría el original (`PlanLimits.trashRetentionDays`). */
  readonly keepOriginalDays: number | null;
}

/** Solo JPEG y PNG por su contenido real (RN-1, recorte del 2026-10-26). */
const SUPPORTED_MIMES: readonly string[] = ['image/jpeg', 'image/png'];
const RATE_LIMIT_WINDOW_SECONDS = 60;
const REQUEST_RATE_KEY_PREFIX = 'optimizer:request:';

/** Interfaz mínima del `PinoLogger` que el servicio usa. */
type OptimizerLogger = Pick<PinoLogger, 'info' | 'warn' | 'error'>;

/**
 * Pedir el cálculo de ahorro y consultar el estado (plan 021 §4 y §5, `OptimizationService` del diagrama). El archivo se
 * resuelve con `OptimizableFileGateway`: solo el propio y vivo (RN-5); ajeno, en la papelera o inexistente es el mismo
 * `NodeNotFoundError` (CA-18, CA-19). Calcular no consulta la solo lectura (CA-17, RN-7). Una optimización en curso
 * perdida caduca al leer (caducidad perezosa, sin programador). A lo sumo una en curso por archivo, y la estimación ya
 * resuelta de la versión vigente se reutiliza en lugar de abrir otra. El cálculo lo hace el `worker` (`OptimizationRunner`).
 */
@Injectable()
export class OptimizationService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(OptimizableFileGateway) private readonly files: OptimizationFiles,
    @Inject(I_JOB_REPOSITORY) private readonly jobs: IJobRepository,
    @Inject(I_JOB_QUEUE) private readonly queue: IJobQueue,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly planLimits: IPlanLimitsProvider,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(OPTIMIZER_CONFIG) private readonly config: OptimizerConfig,
    @Inject(PinoLogger) private readonly logger: OptimizerLogger,
    @Inject(WritableAccountPolicy) private readonly writable: WritableAccountPolicy,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
  ) {}

  /**
   * CA-1 a CA-5: tasa → archivo (404) → tipo real (422) → la fila en curso, la estimación vigente o una nueva. Una en
   * `estimando` se encola después del commit con su id como trabajo: repetir el pedido no agrega otro (y recupera un
   * encolado que falló); si la cola falla, el pedido falla y la fila queda para el próximo pedido o la caducidad.
   */
  async estimate(actor: Actor, fileId: string): Promise<OptimizationView> {
    await this.assertWithinRate(actor);
    const file = await this.supportedFile(actor, fileId);
    await this.latestFresh(actor, fileId);
    const job = await this.transactions.withActor(actor, () => this.currentOrNew(actor, file));
    if (job.state === 'estimando') {
      await this.queue.enqueueEstimate({
        optimizationId: job.id,
        fileId: file.id,
        ownerId: actor.id,
      });
    }
    return this.viewOf(actor, job);
  }

  /**
   * CA-6, CA-11, CA-12, CA-17: confirma con CAS y encola después del commit; repetir recupera un encolado fallido. La
   * vigencia de la estimación se comprueba bloqueando la versión vigente en la misma transacción que el CAS: una versión
   * registrada después de leer el archivo es `409`, no un `202` que el `worker` descartaría después.
   */
  async run(actor: Actor, input: RunOptimizationInput): Promise<OptimizationView> {
    await this.assertWithinRate(actor);
    const file = await this.supportedFile(actor, input.fileId);
    await this.writable.assertWritable(actor);
    await this.latestFresh(actor, file.id);
    const job = await this.transactions.withActor(actor, () =>
      this.beginRun(actor, file, input.optimizationId),
    );
    await this.queue.enqueueRun({ optimizationId: job.id, fileId: file.id, ownerId: actor.id });
    return this.viewOf(actor, job);
  }

  private async supportedFile(actor: Actor, fileId: string): Promise<OptimizableFile> {
    const file = await this.files.findOwnedImage(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    if (file.kind !== 'imagen' || file.mime === null || !SUPPORTED_MIMES.includes(file.mime))
      throw new UnsupportedTypeError();
    return file;
  }

  private async beginRun(
    actor: Actor,
    file: OptimizableFile,
    id: string,
  ): Promise<OptimizationJob> {
    const latest = await this.jobs.latestOf(actor, file.id);
    if (latest?.id !== id) throw new EstimateStaleError();
    if (latest.state === 'optimizando') return latest;
    if (latest.state !== 'estimada' || !(await this.isCurrentSource(actor, latest)))
      throw new EstimateStaleError();
    const next = latest.beginRun(randomUUID(), this.clock.now());
    if (await this.jobs.compareAndSet(actor, next, latest)) return next;
    const winner = await this.jobs.latestOf(actor, file.id);
    if (winner?.id === id && winner.state === 'optimizando') return winner;
    throw new EstimateStaleError();
  }

  /** `FOR SHARE` del archivo si la versión que estimó `job` sigue siendo la vigente (hasta el commit del llamador). */
  private isCurrentSource(actor: Actor, job: OptimizationJob): Promise<boolean> {
    return this.files.lockCurrentVersion(actor, {
      fileId: job.fileId,
      versionId: job.sourceVersionId,
    });
  }

  /** La última optimización (tras caducar una perdida), o `null` si no hay o su resultado dejó de ser vigente. */
  async status(actor: Actor, fileId: string): Promise<OptimizationView | null> {
    const file = await this.files.findOwned(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    const job = await this.latestFresh(actor, fileId);
    if (job === null || job.isObsoleteFor(file.currentVersionId)) return null;
    return this.viewOf(actor, job);
  }

  private async currentOrNew(actor: Actor, file: OptimizableFile): Promise<OptimizationJob> {
    const latest = await this.jobs.latestOf(actor, file.id);
    if (latest?.isInProgress === true || latest?.isEstimateOf(file.currentVersionId) === true) {
      return latest;
    }
    const job = this.newJobFor(file);
    if (await this.jobs.insertIfNoneInProgress(actor, job)) {
      this.logger.info({
        event: 'optimization.requested',
        fileId: file.id,
        optimizationId: job.id,
      });
      return job;
    }
    const winner = await this.jobs.findInProgress(actor, file.id);
    if (winner === null) throw new Error('La optimización en curso desapareció durante el pedido.');
    return winner;
  }

  private newJobFor(file: OptimizableFile): OptimizationJob {
    const input = {
      id: randomUUID(),
      fileId: file.id,
      sourceVersionId: file.currentVersionId,
      originalBytes: file.sizeBytes,
      now: this.clock.now(),
    };
    return file.sizeBytes > this.config.maxFileBytes
      ? OptimizationJob.unavailableBySize(input)
      : OptimizationJob.startEstimate(input);
  }

  /** La última fila; si estaba en curso y se perdió, la deja `fallida` antes de devolverla (plan §5). */
  private async latestFresh(actor: Actor, fileId: string): Promise<OptimizationJob | null> {
    const result = await this.transactions.withActor(actor, () => this.expireLatest(actor, fileId));
    if (result.expired && result.job !== null) {
      await auditOptimizationOutcome(this.audit, actor, result.job);
      const data = result.job.snapshot();
      this.logger.info({
        event: 'optimization.stale_expired',
        fileId,
        optimizationId: data.id,
        actorId: actor.id,
        sourceVersionId: data.sourceVersionId,
        versionId: data.resultVersionId,
        originalBytes: Number(data.originalBytes),
        resultBytes: null,
        reason: data.reason,
      });
    }
    return result.job;
  }

  private async expireLatest(
    actor: Actor,
    fileId: string,
  ): Promise<{ job: OptimizationJob | null; expired: boolean }> {
    const latest = await this.jobs.latestOf(actor, fileId);
    const now = this.clock.now();
    if (latest === null || !latest.isStale(now, this.config.staleAfterMs))
      return { job: latest, expired: false };
    const expired = latest.fail(now);
    if (!(await this.jobs.compareAndSet(actor, expired, latest))) {
      return { job: await this.jobs.latestOf(actor, fileId), expired: false };
    }
    return { job: expired, expired: true };
  }

  private async viewOf(actor: Actor, job: OptimizationJob): Promise<OptimizationView> {
    const pollAfterMs = job.isInProgress ? this.config.pollIntervalMs : null;
    if (job.state !== 'estimada') return { job, pollAfterMs, keepOriginalDays: null };
    const { trashRetentionDays } = await this.planLimits.limitsFor(actor);
    return { job, pollAfterMs, keepOriginalDays: trashRetentionDays };
  }

  private async assertWithinRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(REQUEST_RATE_KEY_PREFIX + actor.id, [
      { limit: this.config.requestsPerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);
    if (decision.allowed) return;
    this.logger.warn({ event: 'optimization.rate_limited' });
    throw new RateLimitExceededError(decision.retryAfterSeconds);
  }
}
