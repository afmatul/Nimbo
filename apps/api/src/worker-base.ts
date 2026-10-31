import type { DynamicModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { z } from 'zod';

import { PlanLimitsBindingModule } from './plan-limits-binding.module';
import {
  EnvModule,
  HealthModule,
  MinioConfigModule,
  RedisHealthIndicator,
  SharedModule,
} from './shared';
import type {
  MinioConfig,
  SharedEnvBase,
  workerEnvSchema,
  workerOptimizerEnvSchema,
} from './shared';
import { WorkerDrainModule } from './worker-drain.module';

/** Entorno validado del `worker` general (incluye `SMTP_*` y `MAIL_FROM`, que lee `NotificationsWorkerModule`). */
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Entorno validado del `worker-optimizer` (PD-158): base común, MinIO, optimizador y su puerto. */
export type WorkerOptimizerEnv = z.infer<typeof workerOptimizerEnvSchema>;

/** Lo único que la base común lee del entorno: el contrato común y MinIO. Lo cumplen los dos entornos. */
export type WorkerBaseEnv = SharedEnvBase & MinioConfig;

/**
 * Lo que componen los dos procesos `worker` (`worker` y `worker-optimizer`, ADR-0038): el entorno validado,
 * `SharedModule`, la configuración de MinIO, la salud solo con Redis (un SMTP caído no la afecta, Art. XII), los
 * eventos en proceso (ADR-0019), el enlace de `I_PLAN_LIMITS_PROVIDER` de la raíz (DF-51) y el cierre ordenado de sus
 * `Worker` de BullMQ (`WorkerDrainModule`, I-3). Sin colas ni procesadores:
 * cada raíz suma solo los suyos.
 */
export const workerBaseImports = (env: WorkerBaseEnv): NonNullable<DynamicModule['imports']> => [
  EnvModule.forRoot(env),
  MinioConfigModule.forRoot(env),
  SharedModule,
  HealthModule.forRoot({ indicators: [RedisHealthIndicator] }),
  EventEmitterModule.forRoot(),
  PlanLimitsBindingModule,
  WorkerDrainModule,
];
