import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

import { AccessModule } from './modules/access';
import { AuditHttpModule } from './modules/audit';
import { BackofficeModule } from './modules/backoffice';
import { BillingHttpModule } from './modules/billing';
import { EditingModule } from './modules/editing';
import { IDENTITY_THROTTLERS, IdentityModule } from './modules/identity';
import { NotificationsModule } from './modules/notifications';
import { RealtimeModule } from './modules/realtime';
import { StorageModule } from './modules/storage';
import { PlanLimitsBindingModule } from './plan-limits-binding.module';
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
import { UserDirectoryBindingModule } from './user-directory-binding.module';

/**
 * Raíz de composición de `api` (plan 000 §6.2, plan 001 §6.8): publica el entorno que `main.ts` ya validó con
 * `apiEnvSchema`, `SharedModule`, los guards globales de autorización (003), la configuración de MinIO, la salud
 * con los tres indicadores y la cola `ping`; los eventos en proceso (ADR-0019), los *throttlers* en memoria
 * (ADR-0017), `notifications`, `identity`, `AccessModule` (`PermissionResolver`, 003) y `storage` (005) con el
 * enlace de `I_PLAN_LIMITS_PROVIDER` en `PlanLimitsBindingModule` (DF-51: `storage` no conoce a `billing`;
 * 006a aporta `PlanLimitsAdapter`), la consulta de la actividad propia de `audit` (004), el catálogo de planes de
 * `billing` (008) —el `worker` no carga ninguna de las dos rutas—, `backoffice` (011), que recibe los mismos módulos de
 * `identity` y `storage` para no instanciarlos dos veces, el canal en vivo (015), al que se le pasa la misma instancia
 * de `IdentityModule` para resolver `I_ACCESS_TOKEN_VERIFIER` sin que `realtime` importe `identity` (Nest deduplica el
 * módulo dinámico por referencia) y la edición (016), que recibe así las mismas instancias de `StorageModule` y de
 * `RealtimeModule`;
 * `IUserDirectory` lo enlaza `UserDirectoryBindingModule` con la de `IdentityModule`.
 */
@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    const identity = IdentityModule.forRoot(env);
    // Una sola instancia de `storage`: `billing`, `backoffice` y `editing` la importan de forma explícita (009,
    // ampliación de la decisión 1; 011; 016).
    const storage = StorageModule.forRoot(env);
    const realtime = RealtimeModule.forRoot(env, identity);
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
        identity,
        AccessModule,
        PlanLimitsBindingModule,
        UserDirectoryBindingModule.forRoot(identity),
        storage,
        AuditHttpModule,
        BillingHttpModule.forRoot(storage),
        BackofficeModule.forRoot(identity, storage),
        realtime,
        EditingModule.forRoot(env, { storage, realtime }),
      ],
      providers: [PingQueue],
    };
  }
}
