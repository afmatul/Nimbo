import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { RedisContainer } from '@testcontainers/redis';
import type { StartedRedisContainer } from '@testcontainers/redis';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { FixedClock } from '../../../src/shared';
import { ENV } from '../../../src/shared/infrastructure/config/env.module';
import { RedisRateLimiter } from '../../../src/shared/infrastructure/rate-limit/redis-rate-limiter';
import {
  REDIS_CLIENT,
  redisClientProviders,
} from '../../../src/shared/infrastructure/redis/redis-client.provider';
import { REDIS_IMAGE } from '../setup/containers';

const MAX_REJECTION_MS = 2500;
const RECOVERY_TIMEOUT_MS = 10000;
const SERVER_PAUSE_MS = 5000;
const RULES = [{ limit: 10, windowSeconds: 60 }];

/** El puerto aleatorio de Docker cambia al reiniciar; fijar uno libre conserva el endpoint del cliente. */
const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return port;
};

/** Espera un nuevo ready; la guardia falla la prueba, nunca sustituye una respuesta Redis. */
const nextReady = (redis: Redis): Promise<void> =>
  new Promise((resolve, reject) => {
    const ready = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      redis.removeListener('ready', ready);
      reject(new Error('Redis no volvió a ready dentro de la guardia de recuperación'));
    }, RECOVERY_TIMEOUT_MS);
    redis.once('ready', ready);
  });

const expectCommandDeadline = async (limiter: RedisRateLimiter): Promise<number> => {
  const startedAt = performance.now();
  const failure: unknown = await limiter.consume(`recovery:${randomUUID()}`, RULES).then(
    () => undefined,
    (error: unknown) => error,
  );
  const elapsedMs = Math.round(performance.now() - startedAt);
  expect(failure instanceof Error && failure.message === 'Command timed out').toBe(true);
  expect(elapsedMs).toBeGreaterThanOrEqual(900);
  expect(elapsedMs).toBeLessThan(MAX_REJECTION_MS);
  return elapsedMs;
};

describe('REDIS_CLIENT real: deadline y recuperación (001 CA-15, 017 CA-12)', () => {
  let container: StartedRedisContainer;
  let moduleRef: TestingModule;
  let client: Redis;

  beforeAll(async () => {
    container = await new RedisContainer(REDIS_IMAGE)
      .withExposedPorts({ container: 6379, host: await freePort() })
      .start();
    moduleRef = await Test.createTestingModule({
      providers: [
        { provide: ENV, useValue: { REDIS_URL: container.getConnectionUrl() } },
        { provide: PinoLogger, useValue: { warn: jest.fn() } },
        ...redisClientProviders,
      ],
    }).compile();
    client = moduleRef.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    try {
      await moduleRef?.close();
    } finally {
      await container?.stop();
    }
  });

  it('CA-15, CA-12: un servidor sin responder vence el comando; tras reiniciar recupera ready y consume en el mismo endpoint', async () => {
    const limiter = new RedisRateLimiter(client, new FixedClock(new Date('2026-10-16T10:00:00Z')));
    await expect(limiter.consume(`before:${randomUUID()}`, RULES)).resolves.toEqual({
      allowed: true,
    });
    expect(client.status).toBe('ready');
    const endpoint = container.getConnectionUrl();
    // Redis sigue conectado, pero deja de procesar comandos: no basta un timeout de conexión TCP.
    const paused = await container.exec([
      'redis-cli',
      'CLIENT',
      'PAUSE',
      String(SERVER_PAUSE_MS),
      'ALL',
    ]);
    expect(paused.exitCode).toBe(0);
    const rejectionMs = await expectCommandDeadline(limiter);
    await Promise.all([nextReady(client), container.restart()]);
    expect(container.getConnectionUrl() === endpoint).toBe(true);
    expect(client.status).toBe('ready');
    await expect(limiter.consume(`after:${randomUUID()}`, RULES)).resolves.toEqual({
      allowed: true,
    });
    process.stdout.write(
      `${JSON.stringify({ event: 'redis.recovery.observed', rejectionMs, status: client.status, sameEndpoint: true })}\n`,
    );
  });
});
