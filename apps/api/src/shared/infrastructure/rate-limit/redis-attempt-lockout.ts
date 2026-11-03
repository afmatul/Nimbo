import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type {
  AttemptReservation,
  IAttemptLockout,
  LockoutPolicy,
  LockState,
} from '../../application/rate-limit/i-attempt-lockout.port';
import { I_CLOCK } from '../../domain/i-clock.port';
import type { IClock } from '../../domain/i-clock.port';
import { REDIS_CLIENT } from '../redis/redis-client.provider';

const MS_PER_SECOND = 1000;
/** Margen del TTL del bloqueo: Redis solo limpia; el vencimiento lo decide el valor frente a `now` (plan §6.4). */
const LOCK_CLEANUP_MARGIN_MS = 60 * MS_PER_SECOND;

/**
 * Registra un fallo y, al llegar al máximo en la ventana, bloquea. Atómico, así fallos concurrentes dejan un solo
 * bloqueo. Con un bloqueo vigente no cuenta el fallo.
 *
 * - `KEYS[1]`: fallos (*sorted set* con la hora en ms como puntaje); `KEYS[2]`: bloqueo (hora de fin en ms).
 * - `ARGV`: ahora en ms, miembro único, ventana en ms, máximo de fallos, bloqueo en ms, TTL del bloqueo en ms.
 *
 * Devuelve `{ activó, ms }`: `{ 0, restantes }` si ya estaba bloqueado (el fallo no cuenta), `{ 1, bloqueo }` si
 * este fallo activó el bloqueo y `{ 0, 0 }` si no quedó bloqueado.
 */
const RECORD_FAILURE_SCRIPT = `
local now = tonumber(ARGV[1])
local lock_until = tonumber(redis.call('GET', KEYS[2]) or '0')
if lock_until > now then
  return {0, lock_until - now}
end

local window = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
redis.call('ZADD', KEYS[1], now, ARGV[2])
redis.call('PEXPIRE', KEYS[1], window)
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[4]) then
  return {0, 0}
end

local lock_ms = tonumber(ARGV[5])
redis.call('SET', KEYS[2], now + lock_ms, 'PX', ARGV[6])
redis.call('DEL', KEYS[1])
return {1, lock_ms}
`;

const failuresKey = (key: string): string => `${key}:fails`;
const lockKey = (key: string): string => `${key}:lock`;

/** Lo que devuelve el script: si este fallo activó el bloqueo y los ms de bloqueo restantes. */
interface FailureOutcome {
  readonly engagedLock: boolean;
  readonly remainingMs: number;
}

const toLockState = (remainingMs: number): LockState =>
  remainingMs > 0
    ? { locked: true, retryAfterSeconds: Math.ceil(remainingMs / MS_PER_SECOND) }
    : { locked: false };

/**
 * `IAttemptLockout` sobre Redis (plan §6.4, DT-3). `now` sale del `IClock`, así `FixedClock` controla ventana y
 * bloqueo. Las claves las arma la aplicación con `sha256(correo)` o el `userId`, nunca el correo. Si Redis falla, el
 * error se propaga: falla cerrado (plan §9).
 */
@Injectable()
export class RedisAttemptLockout implements IAttemptLockout {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async check(key: string): Promise<LockState> {
    const lockUntil = Number((await this.redis.get(lockKey(key))) ?? 0);
    return toLockState(lockUntil - this.clock.now().getTime());
  }

  async recordFailure(key: string, policy: LockoutPolicy): Promise<LockState> {
    const { remainingMs } = await this.countFailure(key, policy);
    return toLockState(remainingMs);
  }

  /** El mismo recuento que `recordFailure`, antes de verificar: solo se rechaza si el bloqueo ya estaba vigente. */
  async reserveAttempt(key: string, policy: LockoutPolicy): Promise<AttemptReservation> {
    const { engagedLock, remainingMs } = await this.countFailure(key, policy);
    const state = toLockState(remainingMs);
    if (engagedLock || !state.locked) {
      return { allowed: true, engagedLock };
    }
    return { allowed: false, retryAfterSeconds: state.retryAfterSeconds };
  }

  async clear(key: string): Promise<void> {
    await this.redis.del(failuresKey(key), lockKey(key));
  }

  private async countFailure(key: string, policy: LockoutPolicy): Promise<FailureOutcome> {
    const nowMs = this.clock.now().getTime();
    const lockMs = policy.lockSeconds * MS_PER_SECOND;
    const [engaged, remainingMs] = (await this.redis.eval(
      RECORD_FAILURE_SCRIPT,
      2,
      failuresKey(key),
      lockKey(key),
      nowMs,
      `${String(nowMs)}:${randomUUID()}`,
      policy.windowSeconds * MS_PER_SECOND,
      policy.maxFailures,
      lockMs,
      lockMs + LOCK_CLEANUP_MARGIN_MS,
    )) as [number, number];
    return { engagedLock: engaged === 1, remainingMs };
  }
}
