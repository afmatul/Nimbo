import { DomainError } from './domain-error';

/** Límite de frecuencia alcanzado. HTTP 429 con `Retry-After: retryAfterSeconds` (001 CA-15). */
export abstract class TooManyRequestsError extends DomainError {
  readonly status = 429;

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}
