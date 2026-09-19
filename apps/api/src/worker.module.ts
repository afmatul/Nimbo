import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { HealthModule, PingProcessor, RedisHealthIndicator, SharedModule } from './shared';
import { PING_QUEUE } from './shared/infrastructure/queue/ping.queue';

/** Colas que este proceso consume; `worker.started` las lista (plan 000 §7). */
export const WORKER_QUEUES = [PING_QUEUE] as const;

/**
 * Raíz de composición del proceso `worker` (plan 000 §6.3, alternativa R-3): compone módulos de `api`,
 * no aloja lógica propia. Salud solo con Redis; consume `ping`.
 */
@Module({
  imports: [
    SharedModule,
    HealthModule.forRoot({ indicators: [RedisHealthIndicator] }),
    BullModule.registerQueue({ name: PING_QUEUE }),
  ],
  providers: [PingProcessor],
})
export class WorkerModule {}
