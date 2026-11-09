import { createHash, randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';

import { FixedClock } from '../../../src/shared';
import type { LockoutPolicy } from '../../../src/shared/application/rate-limit/i-attempt-lockout.port';
import { RedisAttemptLockout } from '../../../src/shared/infrastructure/rate-limit/redis-attempt-lockout';

const START = new Date('2026-09-30T10:00:00Z');
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const POLICY: LockoutPolicy = { maxFailures: 5, windowSeconds: 15 * 60, lockSeconds: 15 * 60 };
const CONCURRENT_FAILURES = 10;

/** `IAttemptLockout` contra Redis real (plan §6.4; CA-5, CA-19, CA-23; 013b CA-14). */
describe('RedisAttemptLockout (CA-5, CA-19, CA-23; 013b CA-14)', () => {
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

  it('CA-5, 013b CA-14: 4 fallos no bloquean; el 5.º bloquea 900 s y avisa que lo activó', async () => {
    for (let failure = 1; failure < POLICY.maxFailures; failure += 1) {
      await expect(lockout.recordFailure(key, POLICY)).resolves.toEqual({ locked: false });
    }

    await expect(lockout.recordFailure(key, POLICY)).resolves.toEqual({
      locked: true,
      retryAfterSeconds: 900,
      engagedLock: true,
    });
    await expect(lockout.check(key)).resolves.toEqual({ locked: true, retryAfterSeconds: 900 });
  });

  it('013b CA-14: con el bloqueo vigente, un fallo más queda bloqueado sin activarlo otra vez', async () => {
    await recordFailures(POLICY.maxFailures);
    clock.advance(MINUTE_MS);

    await expect(lockout.recordFailure(key, POLICY)).resolves.toEqual({
      locked: true,
      retryAfterSeconds: 840,
      engagedLock: false,
    });
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

  it('CA-23: `clear` quita el bloqueo y los fallos acumulados', async () => {
    await recordFailures(POLICY.maxFailures);
    await lockout.clear(key);

    await expect(lockout.check(key)).resolves.toEqual({ locked: false });
    await recordFailures(POLICY.maxFailures - 1);
    await expect(lockout.check(key)).resolves.toEqual({ locked: false });

    await lockout.clear(key);
    await expect(lockout.recordFailure(key, POLICY)).resolves.toEqual({ locked: false });
  });

  it('CA-19, 013b CA-14: 10 fallos simultáneos con máximo 5 dejan un solo bloqueo, un solo `engagedLock` y ninguna excepción', async () => {
    const states = await Promise.all(
      Array.from({ length: CONCURRENT_FAILURES }, () => lockout.recordFailure(key, POLICY)),
    );

    expect(states.filter((state) => !state.locked)).toHaveLength(POLICY.maxFailures - 1);
    expect(states.filter((state) => state.locked)).toHaveLength(
      CONCURRENT_FAILURES - POLICY.maxFailures + 1,
    );
    expect(states.filter((state) => state.locked && state.engagedLock)).toHaveLength(1);
    await expect(redis.keys(`${key}*`)).resolves.toEqual([`${key}:lock`]);
    await expect(lockout.check(key)).resolves.toEqual({ locked: true, retryAfterSeconds: 900 });
  });

  it('CA-23, I-1: `reserveAttempt` cuenta el intento; el 5.º activa el bloqueo y todavía se permite, el 6.º se rechaza', async () => {
    for (let attempt = 1; attempt < POLICY.maxFailures; attempt += 1) {
      await expect(lockout.reserveAttempt(key, POLICY)).resolves.toEqual({
        allowed: true,
        engagedLock: false,
      });
    }

    await expect(lockout.reserveAttempt(key, POLICY)).resolves.toEqual({
      allowed: true,
      engagedLock: true,
    });
    clock.advance(MINUTE_MS);
    await expect(lockout.reserveAttempt(key, POLICY)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 840,
    });
  });

  it('CA-23, I-1: 10 reservas simultáneas con máximo 5 permiten solo 5 y dejan un solo bloqueo', async () => {
    const reservations = await Promise.all(
      Array.from({ length: CONCURRENT_FAILURES }, () => lockout.reserveAttempt(key, POLICY)),
    );

    expect(reservations.filter((reservation) => reservation.allowed)).toHaveLength(
      POLICY.maxFailures,
    );
    expect(reservations.filter((reservation) => !reservation.allowed)).toEqual(
      Array.from({ length: CONCURRENT_FAILURES - POLICY.maxFailures }, () => ({
        allowed: false,
        retryAfterSeconds: 900,
      })),
    );
    await expect(redis.keys(`${key}*`)).resolves.toEqual([`${key}:lock`]);
  });

  it('CA-5: con Redis caído, `check` lanza (falla cerrado)', async () => {
    const down = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    down.on('error', () => undefined);

    await expect(new RedisAttemptLockout(down, clock).check(key)).rejects.toThrow();
    down.disconnect();
  });
});
