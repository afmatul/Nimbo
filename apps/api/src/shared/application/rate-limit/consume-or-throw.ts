import { RateLimitExceededError } from '../../domain/errors';

import type { IRateLimiter } from './i-rate-limiter.port';

/** Ventana única de los límites «por minuto» que se aplican con `consumeOrThrow` (013 M-2). */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Consume `key` con como máximo `limitPerMinute` solicitudes por minuto; si se rechaza, lanza
 * `RateLimitExceededError` con la espera (`Retry-After`). Si el almacén falla, propaga su error (falla cerrado).
 * La clave, el límite y la bitácora del rechazo los pone cada consumidor.
 */
export async function consumeOrThrow(
  limiter: IRateLimiter,
  key: string,
  limitPerMinute: number,
): Promise<void> {
  const decision = await limiter.consume(key, [
    { limit: limitPerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
  ]);
  if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
}
