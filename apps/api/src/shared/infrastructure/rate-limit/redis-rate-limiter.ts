import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type {
  IRateLimiter,
  RateLimitDecision,
  RateLimitRule,
} from '../../application/rate-limit/i-rate-limiter.port';
import { I_CLOCK } from '../../domain/i-clock.port';
import type { IClock } from '../../domain/i-clock.port';
import { REDIS_CLIENT } from '../redis/redis-client.provider';

import { SLIDING_WINDOW_SCRIPT } from './sliding-window.lua';

const MS_PER_SECOND = 1000;

const ruleKey = (key: string, rule: RateLimitRule): string =>
  `${key}:${String(rule.windowSeconds)}`;

/**
 * `IRateLimiter` sobre Redis (001 plan §6.7): un único script Lua atómico, así 20 solicitudes concurrentes con
 * límite 5 dejan pasar exactamente 5. `now` sale del `IClock` (las pruebas lo controlan con `FixedClock`). Si
 * Redis falla, el error se propaga: falla cerrado, igual para cualquier correo.
 */
@Injectable()
export class RedisRateLimiter implements IRateLimiter {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async consume(key: string, rules: readonly RateLimitRule[]): Promise<RateLimitDecision> {
    if (rules.length === 0) {
      return { allowed: true };
    }
    const nowMs = this.clock.now().getTime();
    const reply = await this.redis.eval(
      SLIDING_WINDOW_SCRIPT,
      rules.length,
      ...rules.map((rule) => ruleKey(key, rule)),
      nowMs,
      `${String(nowMs)}:${randomUUID()}`,
      ...rules.flatMap((rule) => [rule.limit, rule.windowSeconds * MS_PER_SECOND]),
    );
    const retryAfterMs = Number(reply);
    return retryAfterMs === 0
      ? { allowed: true }
      : { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / MS_PER_SECOND) };
  }
}
