import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { ENV } from '../config/env.module';
import type { SharedEnvBase } from '../config/env.schema';

/** Cliente ioredis compartido para lo que no es BullMQ (p. ej. `RedisRateLimiter`, 001 plan §6.7). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const CONNECT_TIMEOUT_MS = 1000;
/** Un solo reintento por comando: con Redis caído, quien lo usa falla rápido y cerrado (001 CA-15). */
const MAX_RETRIES_PER_REQUEST = 1;

interface RedisErrorLogger {
  warn(payload: Record<string, unknown>): void;
}

const errorCodeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

/**
 * Conexión perezosa: no se abre hasta el primer comando. El oyente de `error` es obligatorio: sin él, ioredis
 * hace `console.error` con el `stack`, que incluye `REDIS_URL` y su credencial (mismo cuidado que
 * `RedisHealthIndicator`). Solo se registra el código del error, nunca su mensaje.
 */
const createRedisClient = (env: SharedEnvBase, logger: RedisErrorLogger): Redis => {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
  });
  client.on('error', (error: unknown) => {
    logger.warn({ event: 'redis.error', errorCode: errorCodeOf(error) });
  });
  return client;
};

/** Cierra `REDIS_CLIENT` al apagar la aplicación. */
@Injectable()
export class RedisClientShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onApplicationShutdown(): void {
    this.client.disconnect();
  }
}

/** Proveedores que `SharedModule` registra y exporta (T-16). */
export const redisClientProviders: Provider[] = [
  {
    provide: REDIS_CLIENT,
    inject: [ENV, PinoLogger],
    useFactory: createRedisClient,
  },
  RedisClientShutdown,
];
