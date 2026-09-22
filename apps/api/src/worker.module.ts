import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import {
  EnvModule,
  HealthModule,
  PING_QUEUE,
  PingProcessor,
  RedisHealthIndicator,
  SharedModule,
} from './shared';
import type { SharedEnvBase } from './shared';

/** Colas que este proceso consume; `worker.started` las lista (plan 000 §7). */
export const WORKER_QUEUES = [PING_QUEUE] as const;

/**
 * Raíz de composición del proceso `worker` (plan 000 §6.3, alternativa R-3): compone módulos de `api`,
 * no aloja lógica propia. Publica el entorno que `worker.main.ts` validó con `workerEnvSchema`,
 * salud solo con Redis y consume `ping`.
 */
@Module({})
export class WorkerModule {
  static forRoot(env: SharedEnvBase): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        EnvModule.forRoot(env),
        SharedModule,
        HealthModule.forRoot({ indicators: [RedisHealthIndicator] }),
        BullModule.registerQueue({ name: PING_QUEUE }),
      ],
      providers: [PingProcessor],
    };
  }
}
