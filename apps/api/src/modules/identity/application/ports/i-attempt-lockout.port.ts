export type LockState = { readonly locked: false } | { readonly locked: true; readonly retryAfterSeconds: number };

export interface LockoutPolicy {
  readonly maxFailures: number;
  readonly windowSeconds: number;
  readonly lockSeconds: number;
}

export interface IAttemptLockout {
  check(key: string): Promise<LockState>;
  recordFailure(key: string, policy: LockoutPolicy): Promise<LockState>;
  clear(key: string): Promise<void>;
}

export const I_ATTEMPT_LOCKOUT: unique symbol = Symbol('IAttemptLockout');
