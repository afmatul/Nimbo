import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createActor, errorClassOf, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { OptimizableFileGateway } from '../../storage';
import type { OptimizedVersionOutcome } from '../../storage';
import { UnreadableImageError } from '../domain/errors';
import type { OptimizationJob, UnavailableReason } from '../domain/optimization-job';
import { SavingsEstimate } from '../domain/savings-estimate';
import type { SavingsThreshold } from '../domain/savings-estimate';

import { auditOptimizationOutcome } from './optimization-audit';
import { I_INTEGRITY_VALIDATOR } from './ports/i-integrity-validator.port';
import type { IIntegrityValidator } from './ports/i-integrity-validator.port';
import type { OptimizationTask } from './ports/i-job-queue.port';
import { I_JOB_REPOSITORY } from './ports/i-job.repository.port';
import type { IJobRepository } from './ports/i-job.repository.port';
import { I_OPTIMIZER } from './ports/i-optimizer.port';
import type { ImageInspection, IOptimizer } from './ports/i-optimizer.port';

/** Valores de `env.schema.ts` que el `worker` usa al calcular (plan 021 §6). */
export interface OptimizationRunnerConfig {
  /** `OPTIMIZER_MAX_PIXELS`: por encima, `no_disponible(pixeles)` (RN-8). */
  readonly maxPixels: number;
  /** `OPTIMIZER_MIN_SAVED_BYTES` y `OPTIMIZER_MIN_SAVED_PERCENT` (RN-2). */
  readonly threshold: SavingsThreshold;
}

export const OPTIMIZATION_RUNNER_CONFIG = Symbol('OptimizationRunnerConfig');

/** Lo que el `worker` usa de la fachada de `storage` (siempre como la cuenta propietaria). */
export type OptimizerFiles = Pick<
  OptimizableFileGateway,
  'openCurrent' | 'findOwned' | 'registerOptimizedVersion' | 'findRegisteredOptimization'
>;

/** Interfaz mínima del `PinoLogger` que el flujo usa. */
type RunnerLogger = Pick<PinoLogger, 'info' | 'warn' | 'error'>;

/** Bitácora de cada resultado final de la estimación (plan 021 §5). */
const ESTIMATE_EVENTS: Readonly<Record<string, string>> = {
  estimada: 'optimization.estimated',
  no_conviene: 'optimization.not_worth_it',
  no_disponible: 'optimization.unavailable',
  fallida: 'optimization.failed',
};

const ownerOf = (task: OptimizationTask): Actor => createActor(task.ownerId, Role.CLIENT);

/**
 * Flujo del `worker` (`OptimizationRunner`, plan 021 §2) para `estimate` y `run`. Actúa como la cuenta
 * dueña sin confiar en `ownerId`: la RLS de `optimizacion` y la fachada deciden. Reclama con comparar y asignar
 * renovando `actualizado_en` (plan §5), lee la versión de origen, inspecciona, recomprime **en memoria sin guardar
 * nada**, valida la salida (plan §6) y aplica el umbral (RN-2). Lo que no se puede calcular termina `no_disponible`;
 * un candidato inválido, `fallida(integridad)`. Un fallo técnico se relanza
 * para que la cola reintente y, agotados los intentos, `giveUp` la deja `fallida(servicio_no_disponible)` (CA-14).
 */
@Injectable()
export class OptimizationRunner {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(OptimizableFileGateway) private readonly files: OptimizerFiles,
    @Inject(I_JOB_REPOSITORY) private readonly jobs: IJobRepository,
    @Inject(I_OPTIMIZER) private readonly optimizer: IOptimizer,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(OPTIMIZATION_RUNNER_CONFIG) private readonly config: OptimizationRunnerConfig,
    @Inject(PinoLogger) private readonly logger: RunnerLogger,
    @Inject(I_INTEGRITY_VALIDATOR) private readonly integrity: IIntegrityValidator,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
  ) {}

  /** Calcula el ahorro (CA-1, CA-2, CA-5). Lanza solo errores transitorios: la cola reintenta. */
  async estimate(task: OptimizationTask): Promise<void> {
    const owner = ownerOf(task);
    const claimed = await this.claim(owner, task, 'estimando');
    if (claimed === null) return;
    const content = await this.readSource(owner, claimed);
    const next =
      content === null ? claimed.fail(this.clock.now()) : await this.outcomeOf(claimed, content);
    await this.settle(owner, claimed, next);
  }

  /** CA-7 a CA-12: vuelve al original; storage es el único que sube, revalida y registra el candidato. */
  async run(task: OptimizationTask): Promise<void> {
    const owner = ownerOf(task);
    const claimed = await this.claim(owner, task, 'optimizando');
    if (claimed === null) return;
    const recovered = await this.recoverRegistered(owner, claimed);
    const next = recovered ?? (await this.runSource(owner, claimed));
    await this.settle(owner, claimed, next);
  }

  private async recoverRegistered(
    owner: Actor,
    job: OptimizationJob,
  ): Promise<OptimizationJob | null> {
    if (job.resultVersionId === null) return null;
    const registered = await this.files.findRegisteredOptimization(owner, {
      fileId: job.fileId,
      versionId: job.resultVersionId,
    });
    return registered === null ? null : job.complete(registered.sizeBytes, this.clock.now());
  }

  private async runSource(owner: Actor, job: OptimizationJob): Promise<OptimizationJob> {
    const content = await this.readSource(owner, job);
    if (content === null) return this.sourceUnavailable(owner, job);
    try {
      // La estimación ya filtró animadas y gigantes (el origen es inmutable): solo llega aquí si cambió el tope de píxeles
      // entre calcular y confirmar. Una ejecución confirmada no admite `no_disponible`; `integridad` es el motivo final que ofrece.
      if (this.unavailableReason(await this.optimizer.inspect(content)) !== null)
        return job.fail(this.clock.now(), 'integridad');
      const candidate = await this.optimizer.optimize(content);
      if (!(await this.integrity.validate(content, candidate)))
        return job.fail(this.clock.now(), 'integridad');
      const bytes = BigInt(candidate.length);
      if (!new SavingsEstimate(job.originalBytes, bytes).isWorthIt(this.config.threshold))
        return job.discard('ahorro_minimo', this.clock.now(), bytes);
      return this.registerCandidate(owner, job, candidate);
    } catch (error) {
      if (error instanceof UnreadableImageError) return job.fail(this.clock.now(), 'integridad');
      throw error;
    }
  }

  private async sourceUnavailable(owner: Actor, job: OptimizationJob): Promise<OptimizationJob> {
    const file = await this.files.findOwned(owner, job.fileId);
    if (file === null) return job.discard('archivo_eliminado', this.clock.now());
    if (file.currentVersionId !== job.sourceVersionId)
      return job.discard('version_cambiada', this.clock.now());
    throw new Error('El objeto de la versión origen no está disponible.');
  }

  private async registerCandidate(
    owner: Actor,
    job: OptimizationJob,
    candidate: Buffer,
  ): Promise<OptimizationJob> {
    if (job.resultVersionId === null)
      throw new TypeError('La ejecución no tiene versión preasignada.');
    const result = await this.files.registerOptimizedVersion(owner, {
      fileId: job.fileId,
      sourceVersionId: job.sourceVersionId,
      versionId: job.resultVersionId,
      content: Readable.from([candidate]),
      sizeBytes: BigInt(candidate.length),
    });
    return this.registeredOutcome(job, result, BigInt(candidate.length));
  }

  private registeredOutcome(
    job: OptimizationJob,
    result: OptimizedVersionOutcome,
    bytes: bigint,
  ): OptimizationJob {
    const now = this.clock.now();
    switch (result.status) {
      case 'registered':
      case 'duplicate':
        return job.complete(result.sizeBytes, now);
      case 'file_changed':
        return job.discard('version_cambiada', now, bytes);
      case 'file_missing':
        return job.discard('archivo_eliminado', now, bytes);
      case 'not_smaller':
        return job.discard('ahorro_minimo', now, bytes);
      case 'corrupt':
        return job.fail(now, 'integridad');
    }
  }

  /** Intentos agotados (CA-14): `fallida(servicio_no_disponible)` si sigue en curso. */
  async giveUp(task: OptimizationTask, error: unknown): Promise<void> {
    const owner = ownerOf(task);
    const failed = await this.transactions.withActor(owner, async () => {
      const current = await this.jobs.findById(owner, task.optimizationId);
      if (current?.isInProgress !== true || current.fileId !== task.fileId) return null;
      const recovered =
        current.state === 'optimizando' ? await this.recoverRegistered(owner, current) : null;
      const next = recovered ?? current.fail(this.clock.now());
      return (await this.jobs.compareAndSet(owner, next, current)) ? next : null;
    });
    if (failed !== null) {
      await auditOptimizationOutcome(this.audit, owner, failed);
      this.logOutcome(failed, errorClassOf(error), owner);
    }
  }

  /** CAS desde `estimando` (también la de un intento anterior o un `worker` reiniciado) renovando `actualizado_en`. */
  private claim(
    owner: Actor,
    task: OptimizationTask,
    state: 'estimando' | 'optimizando',
  ): Promise<OptimizationJob | null> {
    return this.transactions.withActor(owner, async () => {
      const current = await this.jobs.findById(owner, task.optimizationId);
      if (current?.state !== state || current.fileId !== task.fileId) return null;
      const claimed = current.claim(this.clock.now());
      return (await this.jobs.compareAndSet(owner, claimed, current)) ? claimed : null;
    });
  }

  /** Contenido de la versión de origen; `null` si dejó de ser la vigente o el archivo ya no es de la cuenta. */
  private async readSource(owner: Actor, job: OptimizationJob): Promise<Buffer | null> {
    const ref = { fileId: job.fileId, versionId: job.sourceVersionId };
    const stream = await this.files.openCurrent(owner, ref);
    return stream === null ? null : buffer(stream);
  }

  private async outcomeOf(job: OptimizationJob, content: Buffer): Promise<OptimizationJob> {
    try {
      const reason = this.unavailableReason(await this.optimizer.inspect(content));
      if (reason !== null) return job.unavailable(reason, this.clock.now());
      const result = await this.optimizer.optimize(content);
      if (!(await this.integrity.validate(content, result)))
        return job.fail(this.clock.now(), 'integridad');
      return job.estimated(BigInt(result.length), this.config.threshold, this.clock.now());
    } catch (error) {
      if (error instanceof UnreadableImageError)
        return job.unavailable('ilegible', this.clock.now());
      throw error;
    }
  }

  /** PNG animado o por encima del tope de píxeles decodificados (RN-1, RN-8); `null` si se puede calcular. */
  private unavailableReason(image: ImageInspection): UnavailableReason | null {
    if (image.animated) return 'animada';
    return image.pixels > this.config.maxPixels ? 'pixeles' : null;
  }

  /** Guarda el resultado solo si la fila sigue como se reclamó: otro `worker` que la retomó gana. */
  private async settle(
    owner: Actor,
    claimed: OptimizationJob,
    next: OptimizationJob,
  ): Promise<void> {
    const saved = await this.transactions.withActor(owner, () =>
      this.jobs.compareAndSet(owner, next, claimed),
    );
    if (saved) {
      await auditOptimizationOutcome(this.audit, owner, next);
      this.logOutcome(next, null, owner);
    }
  }

  private logOutcome(job: OptimizationJob, errorClass: string | null, owner: Actor): void {
    if (job.resultVersionId !== null) {
      this.logRunOutcome(job, errorClass, owner);
      return;
    }
    const { fileId, id, state, reason, originalBytes, estimatedBytes } = job.snapshot();
    const base = { event: ESTIMATE_EVENTS[state], fileId, optimizationId: id };
    if (state === 'fallida') {
      this.logger.warn({ ...base, reason, ...(errorClass === null ? {} : { errorClass }) });
      return;
    }
    if (state === 'no_disponible') {
      this.logger.info({ ...base, reason });
      return;
    }
    this.logger.info({
      ...base,
      originalBytes: Number(originalBytes),
      estimatedBytes: Number(estimatedBytes),
    });
  }

  private logRunOutcome(job: OptimizationJob, errorClass: string | null, owner: Actor): void {
    const data = job.snapshot();
    const event =
      data.state === 'completada'
        ? 'optimization.completed'
        : data.state === 'descartada'
          ? 'optimization.discarded'
          : 'optimization.failed';
    const payload = {
      event,
      actorId: owner.id,
      fileId: data.fileId,
      optimizationId: data.id,
      sourceVersionId: data.sourceVersionId,
      versionId: data.resultVersionId,
      originalBytes: Number(data.originalBytes),
      resultBytes: data.resultBytes === null ? null : Number(data.resultBytes),
      reason: data.reason,
      ...(errorClass === null ? {} : { errorClass }),
    };
    if (data.state === 'fallida') this.logger.warn(payload);
    else this.logger.info(payload);
  }
}
