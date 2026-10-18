import { Inject, Injectable } from '@nestjs/common';

import { I_RATE_LIMITER, RateLimitExceededError } from '../../../shared';
import type { Actor, IRateLimiter, RateLimitRule } from '../../../shared';

const PAYMENT_RATE_KEY_PREFIX = 'billing:payment:';
/** Decisión 6 de Adrián (009): 10 intentos por actor cada 15 minutos, más cerca del candado de login que de las cargas. */
const PAYMENT_RATE_RULES: readonly RateLimitRule[] = [{ limit: 10, windowSeconds: 900 }];

/**
 * Límite de intentos de cobro con el cliente presente (spec 009 CA-5; 010 plan §2): contratar y renovar a mano comparten
 * **una** clave por actor, así no se suman 10 y 10 probando tarjetas en las dos rutas.
 */
@Injectable()
export class PaymentAttemptLimiter {
  constructor(@Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter) {}

  /** CA-5: el intento que supera el límite es 429 sin abrir la transacción ni cobrar. */
  async assertAllowed(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(
      `${PAYMENT_RATE_KEY_PREFIX}${actor.id}`,
      PAYMENT_RATE_RULES,
    );
    if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
  }
}
