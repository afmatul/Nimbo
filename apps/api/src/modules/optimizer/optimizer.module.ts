import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from '../../shared';
import { AuditModule } from '../audit';

import { OPTIMIZER_CONFIG, OptimizationService } from './application/optimization.service';
import type { OptimizerConfig } from './application/optimization.service';
import { I_JOB_QUEUE } from './application/ports/i-job-queue.port';
import { I_JOB_REPOSITORY } from './application/ports/i-job.repository.port';
import {
  BullmqJobQueue,
  JOB_QUEUE_CONFIG,
  OPTIMIZATION_QUEUE,
} from './infrastructure/bullmq-job.queue';
import type { JobQueueConfig } from './infrastructure/bullmq-job.queue';
import { TypeOrmJobRepository } from './infrastructure/persistence/typeorm-job.repository';
import { OptimizerController } from './presentation/optimizer.controller';

/** Variables del `api` que `optimizer` usa (plan 021 §6). */
export type OptimizerEnv = Pick<
  Env,
  | 'OPTIMIZER_MAX_FILE_BYTES'
  | 'OPTIMIZER_MAX_ATTEMPTS'
  | 'OPTIMIZER_TIMEOUT_MS'
  | 'OPTIMIZER_POLL_INTERVAL_MS'
  | 'RATE_LIMIT_OPTIMIZER_PER_MINUTE'
>;

/** Módulos de la raíz que `optimizer` usa con **la misma** instancia: `storage` aporta `OptimizableFileGateway`. */
export interface OptimizerDependencies {
  readonly storage: DynamicModule;
}

/** Margen de la caducidad perezosa sobre lo que puede durar un trabajo con todos sus intentos (plan 021 §5). */
const STALE_MARGIN_MS = 5 * 60 * 1000;
/** Pasos de `sharp` por intento (leer, recomprimir, validar), cada uno con su tiempo límite. */
const STEPS_PER_ATTEMPT = 3;

const configOf = (env: OptimizerEnv): OptimizerConfig => ({
  maxFileBytes: BigInt(env.OPTIMIZER_MAX_FILE_BYTES),
  staleAfterMs:
    env.OPTIMIZER_MAX_ATTEMPTS * STEPS_PER_ATTEMPT * env.OPTIMIZER_TIMEOUT_MS + STALE_MARGIN_MS,
  pollIntervalMs: env.OPTIMIZER_POLL_INTERVAL_MS,
  requestsPerMinute: env.RATE_LIMIT_OPTIMIZER_PER_MINUTE,
});

/**
 * Módulo `optimizer` del `api` (M7, plan 021 §2): calcular el ahorro y consultar el estado (`OptimizerController`) con
 * el estado de negocio en `optimizacion`; el cálculo se encola en `optimization`. `SharedModule` (global) aporta
 * reloj, transacciones y límite de tasa; la raíz enlaza `I_PLAN_LIMITS_PROVIDER`. El `api` nunca carga `sharp`
 * (ADR-0037): el procesamiento vive en `OptimizerWorkerModule`.
 */
@Module({})
export class OptimizerModule {
  static forRoot(env: OptimizerEnv, { storage }: OptimizerDependencies): DynamicModule {
    const queueConfig: JobQueueConfig = { maxAttempts: env.OPTIMIZER_MAX_ATTEMPTS };
    return {
      module: OptimizerModule,
      imports: [storage, AuditModule, BullModule.registerQueue({ name: OPTIMIZATION_QUEUE })],
      controllers: [OptimizerController],
      providers: [
        { provide: OPTIMIZER_CONFIG, useValue: configOf(env) },
        { provide: JOB_QUEUE_CONFIG, useValue: queueConfig },
        { provide: I_JOB_REPOSITORY, useClass: TypeOrmJobRepository },
        { provide: I_JOB_QUEUE, useClass: BullmqJobQueue },
        OptimizationService,
      ],
    };
  }
}
