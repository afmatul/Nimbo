import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

import { AccessModule } from './modules/access';
import { IDENTITY_THROTTLERS, IdentityModule } from './modules/identity';
import { NotificationsModule } from './modules/notifications';
import {
  AuthGuardsModule,
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
 * Raíz de composición de `api` (plan 000 §6.2, plan 001 §6.8): publica el entorno que `main.ts` ya validó con
 * `apiEnvSchema`, `SharedModule`, los guards globales de autorización (003), la configuración de MinIO, la salud
 * con los tres indicadores y la cola `ping`; los eventos en proceso (ADR-0019), los *throttlers* en memoria
 * (ADR-0017), `notifications`, `identity` y `AccessModule` (`PermissionResolver`, 003).
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
        AuthGuardsModule,
        HealthModule.forRoot({
          indicators: [PostgresHealthIndicator, RedisHealthIndicator, MinioHealthIndicator],
        }),
        BullModule.registerQueue({ name: PING_QUEUE }),
        EventEmitterModule.forRoot(),
        ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] }),
        NotificationsModule,
        IdentityModule.forRoot(env),
        AccessModule,
      ],
      providers: [PingQueue],
    };
  }
}
