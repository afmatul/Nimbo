import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { z } from 'zod';

import { MAIL_QUEUE, NotificationsWorkerModule } from './modules/notifications';
import {
  EnvModule,
  HealthModule,
  PING_QUEUE,
  PingProcessor,
  RedisHealthIndicator,
  SharedModule,
  workerEnvSchema,
} from './shared';

/** Entorno validado del `worker` (incluye `SMTP_*` y `MAIL_FROM`, que lee `NotificationsWorkerModule`). */
type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Colas que este proceso consume; `worker.started` las lista (plan 000 §7). */
export const WORKER_QUEUES = [PING_QUEUE, MAIL_QUEUE] as const;

/**
 * Raíz de composición del proceso `worker` (plan 000 §6.3, alternativa R-3): compone módulos de `api`,
 * no aloja lógica propia. Publica el entorno que `worker.main.ts` validó con `workerEnvSchema`,
 * salud solo con Redis (un SMTP caído no la afecta, Art. XII), consume `ping` y `mail` (001 plan §6.8).
 */
@Module({})
export class WorkerModule {
  static forRoot(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        EnvModule.forRoot(env),
        SharedModule,
        HealthModule.forRoot({ indicators: [RedisHealthIndicator] }),
        BullModule.registerQueue({ name: PING_QUEUE }),
        NotificationsWorkerModule,
      ],
      providers: [PingProcessor],
    };
  }
}
