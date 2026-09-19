import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  HealthModule,
  MinioHealthIndicator,
  PostgresHealthIndicator,
  RedisHealthIndicator,
  SharedModule,
} from './shared';
import { PING_QUEUE, PingQueue } from './shared/infrastructure/queue/ping.queue';

/** Raíz de composición de `api` (plan 000 §6.2): `SharedModule`, salud con los tres indicadores y la cola `ping`. */
@Module({
  imports: [
    SharedModule,
    HealthModule.forRoot({
      indicators: [PostgresHealthIndicator, RedisHealthIndicator, MinioHealthIndicator],
    }),
    BullModule.registerQueue({ name: PING_QUEUE }),
  ],
  providers: [PingQueue],
})
export class AppModule {}
