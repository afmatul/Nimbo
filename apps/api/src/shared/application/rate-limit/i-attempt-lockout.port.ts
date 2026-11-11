export type LockState =
  { readonly locked: false } | { readonly locked: true; readonly retryAfterSeconds: number };

/**
 * Resultado de registrar un fallo: un `LockState` que, si quedó bloqueado, dice además si este fallo fue el que activó
 * el bloqueo (`engagedLock`). Con fallos simultáneos solo uno lo recibe en `true` (013b CA-14).
 */
export type FailureRecord =
  | { readonly locked: false }
  | { readonly locked: true; readonly retryAfterSeconds: number; readonly engagedLock: boolean };

/**
 * Resultado de reservar un intento antes de verificarlo: con un bloqueo vigente se rechaza sin contarlo; si no, el
 * intento ya cuenta como fallo y `engagedLock` dice si fue el que activó el bloqueo (el último que se verifica).
 */
export type AttemptReservation =
  | { readonly allowed: true; readonly engagedLock: boolean }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface LockoutPolicy {
  readonly maxFailures: number;
  readonly windowSeconds: number;
  readonly lockSeconds: number;
}

export interface IAttemptLockout {
  check(key: string): Promise<LockState>;
  recordFailure(key: string, policy: LockoutPolicy): Promise<FailureRecord>;
  /** Cuenta el intento como fallo antes de verificarlo (atómico); un acierto lo libera con `clear` (002 I-1). */
  reserveAttempt(key: string, policy: LockoutPolicy): Promise<AttemptReservation>;
  clear(key: string): Promise<void>;
}

export const I_ATTEMPT_LOCKOUT: unique symbol = Symbol('IAttemptLockout');
