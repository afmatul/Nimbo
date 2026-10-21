import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_RATE_LIMITER, RateLimitExceededError } from '../../../shared';
import type { Actor, IRateLimiter, RateLimitRule } from '../../../shared';

import type { BackofficeLogger } from './backoffice-logger';

/** Clave del límite: una por cuenta interna (011 T-14, PD-103; plan §5). */
const RATE_KEY_PREFIX = 'backoffice:';

/** 60 peticiones por minuto y por interno (011 T-14; decisión del plan §5). */
export const BACKOFFICE_RATE_RULES: readonly RateLimitRule[] = [{ limit: 60, windowSeconds: 60 }];

/**
 * Límite de tasa de las rutas `/backoffice/*` (011 T-14, PD-103, Art. IX.7): un interno que sondea correos o castiga la
 * API se topa con un `429 SHARED_TOO_MANY_REQUESTS` (el de `shared`, como unifica PD-93). La clave es la cuenta interna,
 * no la IP: el riesgo es una cuenta abusiva, no una oficina compartida.
 */
@Injectable()
export class BackofficeRateLimiter {
  constructor(
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(PinoLogger) private readonly logger: Pick<BackofficeLogger, 'warn'>,
  ) {}

  /** La petición que supera el límite se rechaza con su `Retry-After` y deja bitácora (sin correo ni IP, RNF-17). */
  async assertAllowed(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(
      `${RATE_KEY_PREFIX}${actor.id}`,
      BACKOFFICE_RATE_RULES,
    );
    if (decision.allowed) return;
    this.logger.warn({
      event: 'backoffice.rate_limited',
      actorId: actor.id,
      actorRole: actor.role,
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    throw new RateLimitExceededError(decision.retryAfterSeconds);
  }
}
