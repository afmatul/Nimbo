import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { z } from 'zod';

import type { workerOptimizerEnvSchema } from '../../shared';
import { AuditModule } from '../audit';

import { OPTIMIZATION_RUNNER_CONFIG, OptimizationRunner } from './application/optimization-runner';
import type { OptimizationRunnerConfig } from './application/optimization-runner';
import { I_INTEGRITY_VALIDATOR } from './application/ports/i-integrity-validator.port';
import { I_JOB_REPOSITORY } from './application/ports/i-job.repository.port';
import { I_OPTIMIZER } from './application/ports/i-optimizer.port';
import { OPTIMIZATION_QUEUE } from './infrastructure/bullmq-job.queue';
import { ImageIntegrityValidator } from './infrastructure/image/image-integrity.validator';
import { IMAGE_OPTIMIZER_CONFIG, ImageOptimizer } from './infrastructure/image/image.optimizer';
import type { ImageOptimizerConfig } from './infrastructure/image/image.optimizer';
import { OptimizationProcessor } from './infrastructure/optimization.processor';
import { TypeOrmJobRepository } from './infrastructure/persistence/typeorm-job.repository';

/** Variables que consume `OptimizerWorkerModule` en el proceso especializado (plan 021 §6). */
export type OptimizerWorkerEnv = Pick<
  z.infer<typeof workerOptimizerEnvSchema>,
  | 'OPTIMIZER_TIMEOUT_MS'
  | 'OPTIMIZER_MAX_PIXELS'
  | 'OPTIMIZER_MIN_SAVED_PERCENT'
  | 'OPTIMIZER_MIN_SAVED_BYTES'
  | 'OPTIMIZER_JPEG_QUALITY'
>;

const runnerConfigOf = (env: OptimizerWorkerEnv): OptimizationRunnerConfig => ({
  maxPixels: env.OPTIMIZER_MAX_PIXELS,
  threshold: {
    minBytes: BigInt(env.OPTIMIZER_MIN_SAVED_BYTES),
    minPercent: env.OPTIMIZER_MIN_SAVED_PERCENT,
  },
});

const imageConfigOf = (env: OptimizerWorkerEnv): ImageOptimizerConfig => ({
  maxPixels: env.OPTIMIZER_MAX_PIXELS,
  timeoutMs: env.OPTIMIZER_TIMEOUT_MS,
  jpegQuality: env.OPTIMIZER_JPEG_QUALITY,
});

/**
 * Parte de `optimizer` que corre en el proceso `worker-optimizer` (plan 021 §2, ADR-0037): consume la cola
 * `optimization` con `OptimizationProcessor` (concurrencia 1) y calcula con `OptimizationRunner` e `ImageOptimizer`
 * (`sharp`, solo aquí). Sin controlador. Se exporta por `worker.ts`, no por `index.ts`: el `api` importa ese barril y así
 * nunca carga el binario nativo de `sharp` (ADR-0036). Recibe el módulo de `storage` que elige su raíz:
 * `WorkerOptimizerModule` le pasa `StorageFacadesWorkerModule` (aporta `OptimizableFileGateway`, sin los procesadores de
 * mantenimiento, que son del `worker` general con `StorageWorkerModule`). Estimación y ejecución comparten el
 * optimizador y el validador (plan §6); solo la ejecución entrega el candidato a la fachada para registrarlo.
 */
@Module({})
export class OptimizerWorkerModule {
  static forRoot(env: OptimizerWorkerEnv, storage: DynamicModule): DynamicModule {
    return {
      module: OptimizerWorkerModule,
      imports: [storage, AuditModule, BullModule.registerQueue({ name: OPTIMIZATION_QUEUE })],
      providers: [
        { provide: IMAGE_OPTIMIZER_CONFIG, useValue: imageConfigOf(env) },
        { provide: I_OPTIMIZER, useClass: ImageOptimizer },
        { provide: I_INTEGRITY_VALIDATOR, useClass: ImageIntegrityValidator },
        { provide: OPTIMIZATION_RUNNER_CONFIG, useValue: runnerConfigOf(env) },
        { provide: I_JOB_REPOSITORY, useClass: TypeOrmJobRepository },
        OptimizationRunner,
        OptimizationProcessor,
      ],
    };
  }
}
