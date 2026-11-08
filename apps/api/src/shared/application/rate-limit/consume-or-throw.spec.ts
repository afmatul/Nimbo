import { RateLimitExceededError } from '../../domain/errors';

import { consumeOrThrow, RATE_LIMIT_WINDOW_SECONDS } from './consume-or-throw';
import type { IRateLimiter, RateLimitDecision, RateLimitRule } from './i-rate-limiter.port';

/** Limitador que responde `decision` y guarda lo que recibió. */
const limiterAnswering = (
  decision: RateLimitDecision,
): { limiter: IRateLimiter; calls: [string, readonly RateLimitRule[]][] } => {
  const calls: [string, readonly RateLimitRule[]][] = [];
  const limiter: IRateLimiter = {
    consume: (key, rules) => {
      calls.push([key, rules]);
      return Promise.resolve(decision);
    },
  };
  return { limiter, calls };
};

describe('consumeOrThrow (013 M-2)', () => {
  it('consume la clave con una sola regla: el límite dado en la ventana de 60 s', async () => {
    const { limiter, calls } = limiterAnswering({ allowed: true });

    await expect(consumeOrThrow(limiter, 'sharing:share:ana', 20)).resolves.toBeUndefined();

    expect(RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(calls).toEqual([['sharing:share:ana', [{ limit: 20, windowSeconds: 60 }]]]);
  });

  it('si el limitador rechaza, lanza `RateLimitExceededError` con su espera', async () => {
    const { limiter } = limiterAnswering({ allowed: false, retryAfterSeconds: 42 });

    const error: unknown = await consumeOrThrow(limiter, 'k', 1).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitExceededError);
    expect(error).toMatchObject({ retryAfterSeconds: 42 });
  });

  it('si el almacén falla, propaga ese error sin traducirlo (falla cerrado)', async () => {
    const failure = new Error('redis caído');
    const limiter: IRateLimiter = { consume: () => Promise.reject(failure) };

    await expect(consumeOrThrow(limiter, 'k', 1)).rejects.toBe(failure);
  });
});
