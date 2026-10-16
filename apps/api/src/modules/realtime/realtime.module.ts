import { Module } from '@nestjs/common';
import type { DynamicModule, Type } from '@nestjs/common';

import type { Env } from '../../shared';

import { ConnectionAdmission } from './application/connection-admission.service';
import {
  REALTIME_CONFIG,
  REALTIME_PING_INTERVAL_MS,
  REALTIME_PING_TIMEOUT_MS,
  type RealtimeConfig,
} from './application/realtime-config';
import { ConnectionLifetime } from './infrastructure/connection-lifetime';
import { RealtimeGateway } from './presentation/realtime.gateway';

/** Variables del `api` que `realtime` usa (plan §2); ruta y latido son constantes (YAGNI). */
export type RealtimeEnv = Pick<Env, 'CORS_ORIGIN' | 'REALTIME_CONNECT_ATTEMPTS_PER_MINUTE'>;

/** Módulo que exporta `I_ACCESS_TOKEN_VERIFIER` (`IdentityModule` en la app; un doble en las pruebas). */
export type AccessTokenVerifierModule = Type<unknown> | DynamicModule;

/**
 * Módulo `realtime` (T3, plan 015 §2): configuración del canal, `ConnectionAdmission`, `ConnectionLifetime` y el gateway único. El verificador
 * de tokens lo aporta la raíz de composición con `accessTokenVerifierModule`: `realtime` no importa `identity`
 * (`architecture.md` §3), como `storage` no conoce a `billing` (DF-51). `SharedModule` (global) aporta el limitador.
 * El adaptador (ruta, CORS, latido) lo instala `configureRealtime(app)`.
 */
@Module({})
export class RealtimeModule {
  static forRoot(
    env: RealtimeEnv,
    accessTokenVerifierModule: AccessTokenVerifierModule,
  ): DynamicModule {
    const config: RealtimeConfig = {
      origins: env.CORS_ORIGIN,
      connectAttemptsPerMinute: env.REALTIME_CONNECT_ATTEMPTS_PER_MINUTE,
      pingIntervalMs: REALTIME_PING_INTERVAL_MS,
      pingTimeoutMs: REALTIME_PING_TIMEOUT_MS,
    };
    return {
      module: RealtimeModule,
      imports: [accessTokenVerifierModule],
      providers: [
        { provide: REALTIME_CONFIG, useValue: config },
        ConnectionAdmission,
        ConnectionLifetime,
        RealtimeGateway,
      ],
    };
  }
}
