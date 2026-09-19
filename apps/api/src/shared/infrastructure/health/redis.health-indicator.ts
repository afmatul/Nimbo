import { Inject, Injectable } from '@nestjs/common';
import type { HealthCheckName, HealthCheckStatus } from '@nimbo/contracts';
import { Redis } from 'ioredis';

import type { IHealthIndicator } from '../../application/health/i-health-indicator.port';
import { ENV } from '../config/env.module';
import type { SharedEnv } from '../config/resolve-shared-env';

const CONNECT_TIMEOUT_MS = 1000;

/**
 * `PING` con una conexión efímera por sonda: sin reintentos ni cola fuera de línea, así una caída
 * responde `down` de inmediato y una recuperación no depende de reconexiones en segundo plano.
 */
@Injectable()
export class RedisHealthIndicator implements IHealthIndicator {
  readonly name: HealthCheckName = 'redis';

  constructor(@Inject(ENV) private readonly env: SharedEnv) {}

  async check(): Promise<HealthCheckStatus> {
    const client = new Redis(this.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      const reply = await client.ping();
      return reply === 'PONG' ? 'up' : 'down';
    } finally {
      client.disconnect();
    }
  }
}
