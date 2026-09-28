/** Una regla de ventana deslizante: como máximo `limit` solicitudes en `windowSeconds` (001 D-8). */
export interface RateLimitRule {
  readonly limit: number;
  readonly windowSeconds: number;
}

/** Resultado de `consume`: si se rechaza, cuántos segundos faltan para poder reintentar (`Retry-After`). */
export type RateLimitDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Límite de frecuencia (001 plan §6.7). `consume` evalúa **todas** las reglas de `key` de forma atómica y solo
 * cuenta la solicitud si todas la permiten; las rechazadas no cuentan. Si el almacén falla, lanza (falla cerrado).
 */
export interface IRateLimiter {
  consume(key: string, rules: readonly RateLimitRule[]): Promise<RateLimitDecision>;
}

export const I_RATE_LIMITER = Symbol('I_RATE_LIMITER');
