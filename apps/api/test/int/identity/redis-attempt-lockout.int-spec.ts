import { createHash, randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';

import type { LockoutPolicy } from '../../../src/modules/identity/application/ports/i-attempt-lockout.port';
import { RedisAttemptLockout } from '../../../src/modules/identity/infrastructure/redis-attempt-lockout';
import { FixedClock } from '../../../src/shared';

const START = new Date('2026-09-30T10:00:00Z');
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const POLICY: LockoutPolicy = { maxFailures: 5, windowSeconds: 15 * 60, lockSeconds: 15 * 60 };

/** `IAttemptLockout` contra Redis real (plan §6.4; CA-5, CA-19, CA-23). */
describe('RedisAttemptLockout (CA-5, CA-19, CA-23)', () => {
  let redis: Redis;
  let clock: FixedClock;
  let lockout: RedisAttemptLockout;
  let email: string;
  let key: string;

  const recordFailures = async (count: number): Promise<void> => {
    for (let failure = 0; failure < count; failure += 1) {
      await lockout.recordFailure(key, POLICY);
    }
  };

  beforeAll(() => {
    redis = new Redis(process.env['REDIS_URL'] ?? '', { maxRetriesPerRequest: 1 });
  });

  afterAll(() => {
    redis.disconnect();
  });

  beforeEach(() => {
    clock = new FixedClock(START);
    lockout = new RedisAttemptLockout(redis, clock);
    email = `ana-${randomUUID()}@nimbo.me`;
    // La clave la arma la aplicación con el hash del correo normalizado (plan §6.3).
    key = `identity:lockout:login:${createHash('sha256').update(email).digest('hex')}`;
  });

  it('CA-5: 4 fallos no bloquean; el 5.º bloquea 900 s', async () => {
    for (let failure = 1; failure < POLICY.maxFailures; failure += 1) {
      await expect(lockout.recordFailure(key, POLICY)).resolves.toEqual({ locked: false });
    }

    await expect(lockout.recordFailure(key, POLICY)).resolves.toEqual({
      locked: true,
      retryAfterSeconds: 900,
    });
    await expect(lockout.check(key)).resolves.toEqual({ locked: true, retryAfterSeconds: 900 });
  });

  it('CA-5: sin fallos `check` no bloquea', async () => {
    await expect(lockout.check(key)).resolves.toEqual({ locked: false });
  });

  it('CA-5: los fallos fuera de la ventana de 15 min no cuentan', async () => {
    await recordFailures(POLICY.maxFailures - 1);
    clock.advance(POLICY.windowSeconds * SECOND_MS);

    await expect(lockout.recordFailure(key, POLICY)).resolves.toEqual({ locked: false });
    await expect(lockout.check(key)).resolves.toEqual({ locked: false });
  });

  it('CA-23: a los 14 min 59 s sigue bloqueado con 1 s restante y a los 15 min queda libre', async () => {
    await recordFailures(POLICY.maxFailures);

    clock.advance(14 * MINUTE_MS + 59 * SECOND_MS);
    await expect(lockout.check(key)).resolves.toEqual({ locked: true, retryAfterSeconds: 1 });

    clock.advance(SECOND_MS);
    await expect(lockout.check(key)).resolves.toEqual({ locked: false });
  });

  it('CA-5: el tiempo restante se redondea hacia arriba', async () => {
    await recordFailures(POLICY.maxFailures);

    clock.advance(500);

    await expect(lockout.check(key)).resolves.toEqual({ locked: true, retryAfterSeconds: 900 });
  });

  it('CA-5: las claves en Redis no contienen el correo', async () => {
    await recordFailures(POLICY.maxFailures - 1);
    const pendingKeys = await redis.keys(`${key}*`);
    await lockout.recordFailure(key, POLICY);
    const lockedKeys = await redis.keys(`${key}*`);

    expect(pendingKeys.length).toBeGreaterThan(0);
    expect(lockedKeys.length).toBeGreaterThan(0);
    for (const redisKey of [...pendingKeys, ...lockedKeys]) {
      expect(redisKey).not.toContain(email);
    }
  });
});
