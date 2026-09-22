import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import {
  EnvModule,
  HealthModule,
  MinioConfigModule,
  MinioHealthIndicator,
  PING_QUEUE,
  PingQueue,
  PostgresHealthIndicator,
  RedisHealthIndicator,
  SharedModule,
} from './shared';
import type { Env } from './shared';

/**
 * Raíz de composición de `api` (plan 000 §6.2): publica el entorno que `main.ts` ya validó con
 * `apiEnvSchema`, `SharedModule`, la configuración de MinIO, la salud con los tres indicadores y la cola `ping`.
 */
@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(env),
        MinioConfigModule.forRoot(env),
        SharedModule,
        HealthModule.forRoot({
          indicators: [PostgresHealthIndicator, RedisHealthIndicator, MinioHealthIndicator],
        }),
        BullModule.registerQueue({ name: PING_QUEUE }),
      ],
      providers: [PingQueue],
    };
  }
}
