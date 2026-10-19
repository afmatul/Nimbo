import { randomUUID } from 'node:crypto';

import { createActor, Role } from '../../../shared';
import type { Actor, RateLimitDecision } from '../../../shared';

import { BackofficeRateLimiter } from './backoffice-rate-limiter';

const actor = (): Actor => createActor(randomUUID(), Role.ADMIN);

/** Doble de `IRateLimiter`: anota la clave y las reglas y devuelve lo que se le pida. */
const setup = (decision: RateLimitDecision = { allowed: true }) => {
  const calls: { key: string; rules: readonly { limit: number; windowSeconds: number }[] }[] = [];
  const logs: Record<string, unknown>[] = [];
  const rateLimiter = {
    consume: (
      key: string,
      rules: readonly { limit: number; windowSeconds: number }[],
    ): Promise<RateLimitDecision> => {
      calls.push({ key, rules });
      return Promise.resolve(decision);
    },
  };
  const logger = { warn: (payload: Record<string, unknown>): void => void logs.push(payload) };
  return { calls, logs, limiter: new BackofficeRateLimiter(rateLimiter, logger) };
};

describe('BackofficeRateLimiter (011 T-14, PD-103)', () => {
  it('consume con la clave de la cuenta interna y la regla de 60 por minuto', async () => {
    const { calls, limiter } = setup();
    const internal = actor();

    await limiter.assertAllowed(internal);

    expect(calls).toEqual([
      { key: `backoffice:${internal.id}`, rules: [{ limit: 60, windowSeconds: 60 }] },
    ]);
  });

  it('dentro del límite no rechaza ni deja bitácora', async () => {
    const { logs, limiter } = setup();

    await expect(limiter.assertAllowed(actor())).resolves.toBeUndefined();

    expect(logs).toEqual([]);
  });

  it('al superar el límite responde `429 SHARED_TOO_MANY_REQUESTS` con su espera', async () => {
    const { limiter } = setup({ allowed: false, retryAfterSeconds: 42 });

    await expect(limiter.assertAllowed(actor())).rejects.toMatchObject({
      status: 429,
      code: 'SHARED_TOO_MANY_REQUESTS',
      retryAfterSeconds: 42,
    });
  });

  it('RNF-17: la bitácora lleva el id y el rol del interno, sin correo ni IP', async () => {
    const { logs, limiter } = setup({ allowed: false, retryAfterSeconds: 30 });
    const internal = actor();

    await expect(limiter.assertAllowed(internal)).rejects.toThrow();

    expect(logs).toEqual([
      {
        event: 'backoffice.rate_limited',
        actorId: internal.id,
        actorRole: Role.ADMIN,
        retryAfterSeconds: 30,
      },
    ]);
  });
});
