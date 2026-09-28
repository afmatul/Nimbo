import type { Redis } from 'ioredis';

import { FixedClock } from '../../domain/fixed.clock';

import { RedisRateLimiter } from './redis-rate-limiter';
import { SLIDING_WINDOW_SCRIPT } from './sliding-window.lua';

const NOW = new Date('2026-09-28T10:00:00Z');
const RULE = { limit: 1, windowSeconds: 60 };

const limiterReplying = (reply: number) => {
  const evalMock = jest.fn().mockResolvedValue(reply);
  const limiter = new RedisRateLimiter({ eval: evalMock } as unknown as Redis, new FixedClock(NOW));
  return { limiter, evalMock };
};

describe('RedisRateLimiter (unidad, 001 CA-15)', () => {
  it('CA-15: envía una clave `<key>:<windowSeconds>` por regla y los pares límite/ventana en ms', async () => {
    const { limiter, evalMock } = limiterReplying(0);

    await limiter.consume('identity:email:abc', [RULE, { limit: 5, windowSeconds: 3600 }]);

    expect(evalMock).toHaveBeenCalledWith(
      SLIDING_WINDOW_SCRIPT,
      2,
      'identity:email:abc:60',
      'identity:email:abc:3600',
      NOW.getTime(),
      expect.stringMatching(/^\d+:[0-9a-f-]{36}$/) as string,
      1,
      60_000,
      5,
      3_600_000,
    );
  });

  it('CA-15: respuesta 0 → permitida', async () => {
    const { limiter } = limiterReplying(0);

    await expect(limiter.consume('k', [RULE])).resolves.toEqual({ allowed: true });
  });

  it('CA-15: respuesta en ms → rechazada con los segundos redondeados hacia arriba', async () => {
    const { limiter } = limiterReplying(59_001);

    await expect(limiter.consume('k', [RULE])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('CA-15: sin reglas no consulta Redis', async () => {
    const { limiter, evalMock } = limiterReplying(0);

    await expect(limiter.consume('k', [])).resolves.toEqual({ allowed: true });
    expect(evalMock).not.toHaveBeenCalled();
  });

  it('CA-15: si Redis falla, propaga el error (falla cerrado)', async () => {
    const evalMock = jest.fn().mockRejectedValue(new Error('Connection is closed.'));
    const limiter = new RedisRateLimiter(
      { eval: evalMock } as unknown as Redis,
      new FixedClock(NOW),
    );

    await expect(limiter.consume('k', [RULE])).rejects.toThrow('Connection is closed.');
  });
});
