import { createActor, Role } from '../../../shared';
import type { Actor, IRateLimiter } from '../../../shared';
import { RateLimitExceededError } from '../../../shared/domain/errors';

import { PaymentAttemptLimiter } from './payment-attempt-limiter';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

const limiterWith = (allowed: boolean) => {
  const rateLimiter: IRateLimiter = {
    consume: jest.fn(() =>
      Promise.resolve(
        allowed ? { allowed: true as const } : { allowed: false as const, retryAfterSeconds: 600 },
      ),
    ),
  };
  return { limiter: new PaymentAttemptLimiter(rateLimiter), rateLimiter };
};

describe('PaymentAttemptLimiter (spec 009 CA-5; 010 plan §2)', () => {
  it('CA-5: una sola clave `billing:payment:{actor}` de 10 intentos cada 15 minutos', async () => {
    const { limiter, rateLimiter } = limiterWith(true);

    await limiter.assertAllowed(ANA);

    expect(rateLimiter.consume).toHaveBeenCalledWith(`billing:payment:${ANA.id}`, [
      { limit: 10, windowSeconds: 900 },
    ]);
  });

  it('CA-5: el intento 11 es 429 con los segundos de espera', async () => {
    const { limiter } = limiterWith(false);

    await expect(limiter.assertAllowed(ANA)).rejects.toMatchObject({
      constructor: RateLimitExceededError,
      retryAfterSeconds: 600,
    });
  });
});
