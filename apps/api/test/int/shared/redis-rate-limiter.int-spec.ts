import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';

import { FixedClock } from '../../../src/shared';
import type { RateLimitRule } from '../../../src/shared/application/rate-limit/i-rate-limiter.port';
import { RedisRateLimiter } from '../../../src/shared/infrastructure/rate-limit/redis-rate-limiter';

const START = new Date('2026-09-28T10:00:00Z');
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const COOLDOWN: RateLimitRule = { limit: 1, windowSeconds: 60 };
const HOURLY: RateLimitRule = { limit: 5, windowSeconds: 3600 };
const CONCURRENT_REQUESTS = 20;

/** Ventana deslizante contra Redis real (001 plan §6.7, CA-15). */
describe('RedisRateLimiter (CA-15)', () => {
  let redis: Redis;
  let clock: FixedClock;
  let limiter: RedisRateLimiter;
  let key: string;

  beforeAll(() => {
    redis = new Redis(process.env['REDIS_URL'] ?? '', { maxRetriesPerRequest: 1 });
  });

  afterAll(() => {
    redis.disconnect();
  });

  beforeEach(() => {
    clock = new FixedClock(START);
    limiter = new RedisRateLimiter(redis, clock);
    key = `prueba:${randomUUID()}`;
  });

  it('CA-15: regla 1/60 s → la segunda se rechaza con `retryAfterSeconds = 60` y a los 60 s se permite', async () => {
    await expect(limiter.consume(key, [COOLDOWN])).resolves.toEqual({ allowed: true });
    await expect(limiter.consume(key, [COOLDOWN])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });

    clock.advance(MINUTE_MS);

    await expect(limiter.consume(key, [COOLDOWN])).resolves.toEqual({ allowed: true });
  });

  it('CA-15: regla 5/3600 s → la sexta se rechaza con el `retryAfter` de la más vieja', async () => {
    for (let request = 0; request < HOURLY.limit; request += 1) {
      await expect(limiter.consume(key, [HOURLY])).resolves.toEqual({ allowed: true });
      clock.advance(10 * MINUTE_MS);
    }

    // La más vieja entró hace 50 minutos: faltan 10 para que salga de la ventana.
    await expect(limiter.consume(key, [HOURLY])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10 * 60,
    });
  });

  it('CA-15: el `retryAfter` se redondea hacia arriba', async () => {
    await limiter.consume(key, [COOLDOWN]);
    clock.advance(59 * SECOND_MS + 500);

    await expect(limiter.consume(key, [COOLDOWN])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it('CA-15: con varias reglas, si una rechaza ninguna cuenta la solicitud', async () => {
    await limiter.consume(key, [COOLDOWN, HOURLY]);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(limiter.consume(key, [COOLDOWN, HOURLY])).resolves.toMatchObject({
        allowed: false,
      });
    }

    await expect(redis.zcard(`${key}:${String(HOURLY.windowSeconds)}`)).resolves.toBe(1);
  });

  it('CA-15: el `retryAfter` es el máximo entre las reglas violadas', async () => {
    const perMinute: RateLimitRule = { limit: 1, windowSeconds: 60 };
    const perTwoMinutes: RateLimitRule = { limit: 1, windowSeconds: 120 };
    await limiter.consume(key, [perMinute, perTwoMinutes]);

    await expect(limiter.consume(key, [perMinute, perTwoMinutes])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 120,
    });
  });

  it('CA-15: las rechazadas no cuentan', async () => {
    await limiter.consume(key, [COOLDOWN]);
    await limiter.consume(key, [COOLDOWN]);
    await limiter.consume(key, [COOLDOWN]);

    clock.advance(MINUTE_MS);

    await expect(limiter.consume(key, [COOLDOWN])).resolves.toEqual({ allowed: true });
  });

  it('CA-15: 20 `consume` concurrentes con límite 5 → exactamente 5 permitidas', async () => {
    const decisions = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => limiter.consume(key, [HOURLY])),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(HOURLY.limit);
  });

  it('CA-15: las claves expiran (`PTTL` ≤ ventana)', async () => {
    await limiter.consume(key, [COOLDOWN, HOURLY]);

    const cooldownTtl = await redis.pttl(`${key}:${String(COOLDOWN.windowSeconds)}`);
    const hourlyTtl = await redis.pttl(`${key}:${String(HOURLY.windowSeconds)}`);

    expect(cooldownTtl).toBeGreaterThan(0);
    expect(cooldownTtl).toBeLessThanOrEqual(COOLDOWN.windowSeconds * SECOND_MS);
    expect(hourlyTtl).toBeGreaterThan(0);
    expect(hourlyTtl).toBeLessThanOrEqual(HOURLY.windowSeconds * SECOND_MS);
  });

  it('CA-15: con Redis caído, lanza (falla cerrado)', async () => {
    const down = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    down.on('error', () => undefined);

    await expect(new RedisRateLimiter(down, clock).consume(key, [COOLDOWN])).rejects.toThrow();
    down.disconnect();
  });
});
