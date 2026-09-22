import { Inject, Injectable } from '@nestjs/common';
import type { HealthCheckName, HealthCheckStatus } from '@nimbo/contracts';
import { Redis } from 'ioredis';

import type { IHealthIndicator } from '../../application/health/i-health-indicator.port';
import { ENV } from '../config/env.module';
import type { SharedEnvBase } from '../config/env.schema';

const CONNECT_TIMEOUT_MS = 1000;

/**
 * `PING` con una conexión efímera por sonda: sin reintentos ni cola fuera de línea, así una caída
 * responde `down` de inmediato y una recuperación no depende de reconexiones en segundo plano.
 */
@Injectable()
export class RedisHealthIndicator implements IHealthIndicator {
  readonly name: HealthCheckName = 'redis';

  constructor(@Inject(ENV) private readonly env: SharedEnvBase) {}

  async check(): Promise<HealthCheckStatus> {
    const client = new Redis(this.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    // Sin oyente de `error`, ioredis no lanza el evento: hace `console.error(..., error.stack)`,
    // que esquiva Pino y volcaría `REDIS_URL` con su credencial (prohibición dura de bitácoras).
    client.on('error', () => undefined);
    try {
      await client.connect();
      const reply = await client.ping();
      return reply === 'PONG' ? 'up' : 'down';
    } catch {
      // `HealthService` ya traducía el rechazo a `down`; traducirlo aquí evita además que el
      // error —que incluye la URL— llegue a cualquier registro de arriba.
      return 'down';
    } finally {
      client.disconnect();
    }
  }
}
