import { Module } from '@nestjs/common';

import {
  HealthModule,
  MinioHealthIndicator,
  PostgresHealthIndicator,
  RedisHealthIndicator,
  SharedModule,
} from './shared';

/** Raíz de composición de `api` (plan 000 §6.2). T-21 registra la cola `ping`. */
@Module({
  imports: [
    SharedModule,
    HealthModule.forRoot({
      indicators: [PostgresHealthIndicator, RedisHealthIndicator, MinioHealthIndicator],
    }),
  ],
})
export class AppModule {}
